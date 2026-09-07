> Personas are fictional cognitive frames — see the pulsar-team SKILL.md §1 disclaimer. Nothing here is a statement by or about a real person.

## Verdict

The gate itself is defensible on paper — F23's blind spot closes clean — but the one number that would prove it is not just unmeasured (F8's stale complaint), it is *unmeasurable as built*: nobody logs a stranger hitting the wall, so the drop-off the gate causes has no denominator, gated or not.

## Top 3 findings (all NEW — no F1–F29 row covers the gate's own mechanics)

**1. [instrumented] The gate's dropout is invisible by construction.** `grep -n "download" components/analytics.tsx` → zero hits; `components/download-mcpb-link.tsx` only attaches attribution params on click, no `track()` call. Server-side, `server/api/mcpb-download/route.ts:215-220` calls `trackDownload()` *after* the `if (!session)` branch has already returned — an anonymous hit that bounces to `/sign-up` is counted nowhere. F8 says the scoring number is 17 days stale; this is worse than staleness — the specific number needed to judge the gate (clicks vs. completed sign-ups vs. bail-to-GitHub) was never wired to exist.

**2. [instrumented] Real ungated volume is real, and it's measurable today — just not against the thing it needs to be measured against.** `gh api repos/justinwilliames/orbit-for-claude/releases --jq '.[].assets[].download_count'` summed across every tag from v0.28.0 (the first free build, 12 Aug) to v0.39.1 today = **285 downloads** of the identical asset the MCP registry also resolves to (`app/api/mcpb-download/route.ts:126-137`, own comment: "registry requires a resolvable public URL"). That is the volume the account gate cannot see and cannot capture identity for. The `downloads` table total (`lib/db.ts:661`, `SELECT COUNT(*) FROM downloads`) is the other half of that ratio and it's admin-session-gated — I can't pull it read-only, same wall as F8. **The one measurement that settles keep-vs-drop:** `site-gated downloads : 285 ungated` over the same window. If gated dominates, the friction is priced right — ship the instrumentation in #1 and stop there. If 285 is the majority, the gate is filtering the majority of the very audience it exists to reach into a population Orbit cannot contact, and email-only capture (the codebase already has one, see CHALLENGE) is the honest fallback.

**3. [instrumented] Vector's R3 question, answered.** *"What does per-skill landing copy cost, and who decided it?"* — I decided it (`R2-iris-solo.md:39`), and I priced it wrong by assumption, not evidence. `lib/skills-library.ts` entries are one object literal — `lead`, `whenToUse`, `output`, `category` — and `app/skills/[slug]/page.tsx:24-30` derives the OG image and the whole page from those three strings at request time; there is no per-skill asset, template, or manual page. Real cost is drafting three sentences in-voice: **10–15 minutes, not a "forty-minute tax."** Vector's velocity-cap concern doesn't hold at the true price — three skills a release costs under an hour, not the two-plus he priced it at.

## The single thing I'd ship

Fire `track("download_gate_hit", {...})` in `download-mcpb-link.tsx` on every click, before the redirect resolves — the generic `track()` helper (`components/analytics.tsx:64`) already exists, so this is one call, no new table, no schema change. Paired with the existing `recordUserDownload` completion event, the dropout rate becomes a GA funnel query instead of a guess. **Under an hour, fully reversible (an analytics call, nothing gates on it), owner Nova** (she owns the component) with Voyager signing off the event shape so it doesn't join the eighteen-column-zero-writer graveyard F18 already found once.

## What I'd defer

Redesigning the sign-up form itself (password + security question vs. email-only) — that's a real cost question but it's premature until #2's ratio exists. Deciding it now is Vector's named failure mode: a not-building call made on nobody's evidence, aimed at the funnel instead of a feature list.

## Question, asked aloud

`~/code/pulsar/scripts/say.sh "Atlas — you flagged the security-question reset as friction without ruling on the gate itself. Once the click-tracking ships, does the six-field form change your read of that reset flow, or does it stand regardless of volume?" --agent iris`

**Written:** "Atlas — you flagged the security-question reset as friction without ruling on the gate itself. Once the click-tracking ships, does the six-field form change your read of that reset flow, or does it stand regardless of volume?"

## CHALLENGE

The codebase already runs a lighter capture path — `app/api/email-signup/route.ts`, email + first name, no password, no security question — used elsewhere for lead capture. If #2's ratio comes back showing the account wall is losing the majority to the 285, the fallback isn't a hypothetical: it's forty lines away, already in production, already GDPR-commented. Don't build a new lightweight form if that finding lands — swap the download gate onto the existing one.

— Iris
