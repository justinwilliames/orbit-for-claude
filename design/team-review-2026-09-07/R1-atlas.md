> Personas are fictional cognitive frames — see the pulsar-team SKILL.md §1 disclaimer. Nothing here is a statement by or about a real person.

## Verdict

The install-time UX is fundamentally sound — a fresh, fully-empty config correctly returns `status: "ready"` with a one-line next step, not a wall of missing credentials — but the exact page a stranger reads *before* installing tells them to fetch a deprecated, license-gated package instead of the current one, and the number naming what they're about to get disagrees with itself five different ways across the surfaces I checked in a single session. The first three minutes are a worse experience than the product earns.

## Top 3 findings

**1. [instrumented] The downloads page's registry-install path names a deprecated, license-gated package as canonical.** I fetched `https://yourorbit.team/downloads` live: *"Orbit's registry name is below... `io.github.justinwilliames/braze-lifecycle-mcp`... The older `io.github.justinwilliames/orbit-for-claude` entry is deprecated."* `get-orbit/app/downloads/page.tsx:34-35` hardcodes this, commented `/** The live MCP registry entry. */`. But `orbit-for-claude/README.md:78` names the canonical entry as `io.github.justinwilliames/orbit-lifecycle-mcp`, and calls `braze-lifecycle-mcp` deprecated at "newest published version 0.31.0" that "still carr[ies] the removed licence gate" — exactly the package the live site sends people to. `git log -S` shows the README rename landed at `3b7b3ef` (0.33.0); the get-orbit page's last touch, `dcf32c9`, predates that by a month and was an unrelated telemetry fix. A stranger who picks the no-account registry route — the page's own alternative to creating a free account — is walked into a stale, gated build the project disowns.

**2. [instrumented] Skill count disagrees across five surfaces read in one sitting, one a shipped concatenation bug.** README: "86 skills." This session's own connector instructions: `mcp__orbit` says "83 skills," `mcp__Orbit` says "81 skills" — two live blocks in one tool listing disagreeing with each other. The homepage hero, inspected via its raw Next.js payload, renders `["...That is ", 79, "lifecycle skills..."]` — React joins with no separator, so the visible text reads **"That is 79lifecycle skills"**, confirmed by `get_page_text` and the JSX source alike. The downloads-page FAQ schema says "79." This extends R0's count-spine finding with worse evidence: five numbers, one glued into a visible typo on the first screen a visitor reads, surviving a third review cycle with no fix landed.

**3. [instrumented] The Stripo auth-failure message reverts to raw-env-var language a Desktop user can't act on.** `stripo-emails.js:257-258`, missing-token case: *"...Generate it in Stripo... then set `ORBIT_STRIPO_REST_API_TOKEN`."* Compare the Google AI key message, in two places (`google-genai.js:100`, `setup-validator.js:269`): *"Add your Google AI API key in Settings → Extensions → Orbit (the Google AI API Key field), then fully quit and relaunch Claude Desktop..."* — and `stripo-onboarding.js:470` gets the same Stripo fields right: *"Settings → Extensions → Orbit → Configure, paste them into `Stripo Plugin ID`."* The correct pattern exists twice; the tool most likely to fire mid-session on a real push failure doesn't use it. A Desktop user — the primary audience — is told to "set" a Unix environment variable with no path from where they're sitting to doing that.

## What I'd ship

Fix `get-orbit/app/downloads/page.tsx:34-35`: swap `REGISTRY_NAME` to `io.github.justinwilliames/orbit-lifecycle-mcp`, and update the "older entry is deprecated" line to name both `braze-lifecycle-mcp` and `orbit-for-claude`, matching the README. One constant plus one paragraph. Under an hour, fully reversible, owner **Nova**. This is the finding with the sharpest cost: it sends the strangers who cared enough to avoid the account gate into the worse experience.

## What I'd defer

The 35-field flat `user_config` list (`manifest.json`, counted directly) is real cognitive load — eight platforms' credentials interleaved with three toggles, no grouping — but I don't know whether the MCPB manifest schema or Desktop's settings renderer supports sectioning at all. Route to Nova/Sentinel before treating it as actionable. Whether the free-account gate should exist at all is Iris's call, not mine — I reviewed the form's friction (a secret-question reset instead of email, which nudges toward reusing a real security answer on a marketing site), not the gate itself.

## Question for another drone

> Nova — the get-orbit downloads page hardcodes the deprecated registry name as canonical, a month after orbit-for-claude renamed it at 0.33.0. Is the one-line constant swap actually sufficient, or does anything server-side still key off `braze-lifecycle-mcp` that would break on a straight string change?

(Asked aloud via `say.sh --agent atlas`.)

## CHALLENGE (to Justin)

You asked for ten fixed review iterations; the orchestrator proposed a circuit breaker instead. I have evidence, not just an opinion: the registry-name drift and the skill-count drift are both single-file fixes flagged in *prior* cycles and still unfixed when I opened the files today — the count drift has survived three cycles (06-30, 07-08, 08-31, now this one) with no commit landing. A fixed ten-round schedule doesn't fail because ten is wrong; it fails if nothing gates round N+1 on round N's ship-now bucket actually shipping. Recommend: keep the ten-round ceiling, but require each round to check the prior round's ship-now items against `git log` before opening new findings in the same area — otherwise this compounds into an ever-longer "do not rediscover" list instead of a shrinking one.

— Atlas
