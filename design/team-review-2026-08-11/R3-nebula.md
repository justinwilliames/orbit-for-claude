# R3 — Nebula (Creative Director: brand + narrative)

> Personas are fictional cognitive frames — see pulsar-team SKILL.md §1. Nothing here is a statement by or about a real person.

Cycle 3. My R2 findings landed — `ba1bf34` names the guide library in the
README, `309a04d` kills the 22 phantom protocol citations, and `McpCtaBanner`
now says *"Orbit is a free extension… Download Orbit — free"* instead of selling
a one-off at a signup wall. Good. I didn't re-audit them.

This pass I went looking for the surfaces that carry Orbit's name **away** from
Orbit — the places where a stranger meets the brand without Orbit being in the
room. There are exactly two of them in the whole estate, and both are switched
off.

Read this round: `app/certifications/[certId]/page.tsx`, `lib/linkedin.ts`,
`components/badge-claim-card.tsx`, `components/course-completion-block.tsx`,
`app/account/badges/page.tsx`, `lib/courses.ts`, `app/guides/[slug]/page.tsx`,
`components/GuideEmailCapture.tsx`, `components/inline-email-capture.tsx`,
`app/api/email-signup/route.ts`, `app/admin/subscribers/page.tsx`,
`app/state-of-crm-copy/page.tsx`, `app/llms.txt/route.ts`, `app/press/page.tsx`,
`app/compare/page.tsx`, `app/page.tsx`, `README.md`, `package.json`.

---

## The diagnosis in one paragraph

Every finding in three rounds has been about the front door — the README, the
hero, the download button. Fine. But a product with two visitors in fourteen
days does not have a front-door problem, it has a **nobody-is-walking-past**
problem, and the only two mechanisms Orbit owns for getting in front of people
who have never heard of it are a LinkedIn certificate and an email list. The
certificate page sells nothing and is set to `noindex, nofollow`. The email list
has three elaborate capture surfaces, a jurisdiction-aware consent audit trail,
hashed IPs and secret questions — and no sender, no trigger, and no unsubscribe
page. Orbit has built two distribution loops with enormous care and connected
neither end of either one.

---

## 1. The one page a stranger reaches through somebody they trust, and it sells nothing

`lib/linkedin.ts` builds a real, working Add-to-Profile deeplink with Orbit's
Company Page ID baked in (`113043010`). Somebody finishes a course, one click,
and *"Deliverability Mastery — Orbit"* appears in the Certifications section of
their LinkedIn profile, in front of every peer and recruiter who reads it. When
one of them clicks **Verify**, LinkedIn sends them to
`/certifications/<certId>`.

That is the highest-trust arrival in the entire funnel. Not a search result, not
an ad — a peer's implicit endorsement. Here is what waits there:

```
$ grep -rl "api/og" app | wc -l
      38
$ grep -n "openGraph\|api/og\|/downloads\|\bfree\b" 'app/certifications/[certId]/page.tsx'
(no output, exit 1)
```

Thirty-eight pages on this site ship a custom `/api/og` share card. The press
kit has one. The signup page has one. The **one page whose entire reason to
exist is being shared by a third party** has none — paste that URL into
LinkedIn, Slack or a DM and it renders as a bare grey link.

And the page itself, which is otherwise beautifully made — dashed emerald
verification card, credential ID, an honest footnote that this is *"a record of
self-directed study, not an accredited qualification"* — offers the visitor
exactly two outbound moves:

```
app/certifications/[certId]/page.tsx:138  "View the course"
app/certifications/[certId]/page.tsx:148  "About Orbit"
```

No download. No mention that Orbit is free. No mention that Orbit is an
extension for Claude at all — the string "MCP" does not appear on the page. A
stranger who has just watched a colleague they respect certify in this thing is
handed a link labelled **About Orbit**, which is the weakest verb in marketing.

Then the metadata closes the door behind them:

```
app/certifications/[certId]/page.tsx:46
    robots: { index: false, follow: false },
```

I am *not* going to tell you to index these. Per-person pages, thin content,
unbounded URL space — `index: false` is the right call and I'd defend it. But
`follow: false` is a separate switch and it is throwing away the only link
equity this loop generates, for nothing.

The entry to the same loop is shut too. A guide only shows its course context
when the reader arrived carrying `?from=<course>`
(`app/guides/[slug]/page.tsx:147-151`, `showCourseContext`). Which means every
organic reader — the only traffic Orbit actually has — reads a guide, hits
share-bar → email capture → download CTA, and is never told that the thing they
just read is chapter three of *Deliverability Mastery*, that finishing it earns
a shareable credential, or that courses exist.

**Fix (one owner, half a day).** Three edits. (a) Give the cert page an
`/api/og` card — the holder's name, the course title, the Orbit mark — because
that image is the actual advertisement and it currently doesn't exist. (b)
Replace "About Orbit" with the real offer: *"Orbit is free — the guides, the
courses, and the extension that runs this playbook inside Claude"* over a button
to `/downloads`. (c) Flip `follow: true`, and add a "this guide is part of
&lt;course&gt;" strip to guides for readers who arrive without `?from=`.

Yes, this loop needs users to exist before it fires. That is precisely why you
fix it now — the version that ships broken is the version that wastes the first
ten people who ever certify.

## 2. Orbit ships a tool that audits unsubscribe pages. Orbit has no unsubscribe page.

This is the one I'd fight for, and it is my pet subject wearing a compliance hat.

Orbit collects marketing consent in four places:

```
$ grep -rln "api/email-signup" components app | sort
app/api/account/create/route.ts
components/GuideEmailCapture.tsx        ← all 90 guide footers
components/email-capture-modal.tsx      ← site-wide modal
components/inline-email-capture.tsx     ← all 13 /apps tool pages
```

The collection machinery is genuinely rigorous. `app/api/email-signup/route.ts`
stores the exact consent string shown, the resolved country, a SHA-256 of the
IP, the user agent and a timestamp, and its header comment explains why: *"This
is what a regulator or unsubscribe dispute would ask for."* It downgrades
consent server-side for opt-in jurisdictions. `inline-email-capture.tsx` asks
for a secret question and answer so a subscriber can change their address later
without a verification round trip. Somebody thought hard about this.

The stored consent text is `CONSENT_TEXT_V1`:

> *"Send me Orbit updates — new MCPB versions, new skills, new web apps.
> Roughly monthly. **You can unsubscribe anytime.**"*

And `GuideEmailCapture.tsx:22`:

> *"Guides and Orbit updates only. No sequences, no selling your address."*
> …under a headline that promises *"New guides and product updates land in your
> inbox when they ship."*

Now:

```
$ find app -ipath "*unsub*" -o -ipath "*preferences*"
(empty)

$ node -e "…Object.keys(pkg.dependencies)"
@aws-sdk/client-s3, @aws-sdk/s3-request-presigner, @dnd-kit/core,
@dnd-kit/sortable, @dnd-kit/utilities, @types/canvas-confetti, bcryptjs,
canvas-confetti, jose, liquidjs, next, pg, react, react-dom, sharp
```

Fifteen dependencies. No Resend, no Postmark, no SendGrid, no nodemailer, no
SES. No `/unsubscribe` route, no preference centre, no route of any kind that a
List-Unsubscribe header could point at. The only path out of the database is
`/api/admin/subscribers/csv` — a manual export into some tool that isn't in this
repo.

So the promise *"land in your inbox when they ship"* is event-driven language
served by a human remembering to download a CSV, and the promise *"unsubscribe
anytime"* is served by nothing at all.

Hold that against what Orbit sells:

```
lib/guides/unsubscribe-page-matters.tsx:55
  "…the newer Yahoo and Gmail bulk sender rules that specifically require
   genuine one-click unsubscribe. Three regulators, one requirement,
   no wiggle room."

lib/skills-library.ts:122  gmail-bulk-sender-compliance
  "…SPF/DKIM/DMARC alignment, one-click unsubscribe, complaint-rate
   thresholds, and the 5,000/day enforcement cliff."
```

Plus a shipped MCP tool literally named `orbit_audit_unsubscribe_page`, which
grades other people's.

Orbit's entire brand equity is *practitioner authority* — "the protocols are the
job, written down." A lifecycle-marketing product that collects consent it
cannot honour is not a bug report, it is the brand contradicting itself in
public, on the one asset that could actually fix its distribution problem. That
email list is the highest-leverage thing Orbit owns: the guides get the traffic,
the list is how traffic becomes an audience you can tell about a release. It has
been filling up for months, pointed at nothing.

**Fix.** Two days, one owner, in this order: (1) build `/unsubscribe?t=<signed
token>` against the existing `email_signups` row — one click, no login, sets
`marketing_consent = false`. That is table stakes and it unblocks everything
else. (2) Wire one transport (Resend is an afternoon on this stack) and send the
list one issue. Not a campaign — one honest email that says *Orbit is free now,
here is what changed, here is the download.* If the list is small, that is
information, not a reason to skip it. (3) Then, and only then, the copy is true.

If you don't want to run a newsletter — fair, it's a commitment — then take the
capture down. Collecting addresses you never mail is worse than not asking:
every one of those people gave you something in exchange for a promise, and the
first email they ever get, whenever it comes, arrives from a sender they have
completely forgotten. That's a spam complaint you manufactured yourself, and
Orbit has a guide about it.

## 3. "14,000+" is typed into three files and computed in one

`/state-of-crm-copy` is a nice piece of work — live 30-day aggregates from the
scoring tools, with a genuinely graceful empty state (*"Live data … will appear
here as scoring events accumulate"*). The page body derives its headline number
from the snapshot: `formatInt(subjectTotal + slopTotal)`.

The number a stranger actually sees first does not.

```
$ grep -rn "14,000" app lib components
app/state-of-crm-copy/page.tsx:30      description: "What 14,000+ real CRM subject
                                        lines and slop-detector runs tell us…"
app/apps/subject-line/page.tsx:231     title="Want to see how your subject lines
                                        stack up against 14,000 others?"
components/inline-email-capture.tsx:55 "One email a month — what 14,000 real
                                        subject lines scored this month…"
```

(The two other hits are sample-size worked examples in guide copy — unrelated,
correct.)

Line 30 is a static `metadata` export. It is the Google search snippet, the
social preview, and the string an LLM crawler ingests — and `llms.txt:109`
advertises this exact page to every crawler as *"Citable benchmarks for current
CRM-copy quality."* It is frozen at whatever was true the day it was typed and
can never agree with the live figure below it except by coincidence. Line 231
sells the subject-line tool on a social-proof number nothing verifies. Line 55
promises a monthly data drop built on it — see §2 for how that goes.

**Fix:** `export async function generateMetadata()` reading the same snapshot,
and pass the live total into the two components. Ten lines. Either the number is
real enough to compute or it should not be on the page — and for a brand whose
own `verified-proof-numbers` discipline says a statistic must exist somewhere
before it ships, hand-typing one three times is the wrong look.

---

## What I looked at and deliberately did not file

- **The press kit** (`app/press/page.tsx`). I went in expecting stale $249
  boilerplate and satellite products. It's clean — every count derived from
  `COUNTS`, price reads "Free for everyone", the one-liner is good. Nothing to do.
- **`llms.txt`.** 188 lines, and it is the most coherent, honest, well-organised
  description of Orbit that exists anywhere — better than the homepage, better
  than the README. It even has a "For AI assistants — when and how to recommend
  Orbit" section. It is also read exclusively by machines. There's a thought in
  there about the human surfaces borrowing its clarity, but the sentence problem
  is already filed twice and I'm not laundering it into a third round.
- **The homepage hero.** *"A lifecycle marketer, built into Claude."* now matches
  the README's line 3, and the CTA goes to `/downloads`. That's the fix landing.
  The hero still never says "free" above the fold, which I'd change — but it sits
  inside a filed cluster and doesn't earn its own row.
- **The palette.** Third round, still stock indigo-500. Still not filing it.
  Nobody has ever declined to install an MCP over a hex code.
- **`state: "buy"`** in the hero's analytics metadata (`app/page.tsx:154`) — a
  leftover from the paid era. Cosmetic, Voyager's lens, not worth an owner.

## Verdict

Orbit's distribution problem has been diagnosed three rounds running as a
front-door problem. It isn't. The doors are fine now. What's missing is that
Orbit owns exactly two ways to reach a person who has never heard of it — a
credential somebody else displays on their profile, and a list of people who
already raised their hand — and it has built both with real care and then failed
to connect either end. The certificate page has no share image, no offer, and
`follow: false`. The list has four capture points, a regulator-grade consent
trail, and no way out and no way to send.

Fix the unsubscribe page first, because a lifecycle product that can't honour
its own consent string is the one contradiction the audience Orbit is courting
will actually notice.

— Nebula
