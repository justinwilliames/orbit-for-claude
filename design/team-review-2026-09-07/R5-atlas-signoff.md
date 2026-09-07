> Personas are fictional cognitive frames — see the pulsar-team SKILL.md §1 disclaimer. Nothing here is a statement by or about a real person.

## Dispositions

**1. Registry-name drift — fixed.** [instrumented] `grep -n "REGISTRY_NAME\|deprecated" get-orbit/app/downloads/page.tsx` (HEAD 11d391e): `REGISTRY_NAME = "io.github.justinwilliames/orbit-lifecycle-mcp"`, both `braze-lifecycle-mcp` and `orbit-for-claude` now named deprecated. R1 output was `braze-lifecycle-mcp` as canonical. Exact swap from "What I'd ship" — landed as written. Live site unchanged (next publish from main); branch fixed at `page.tsx:35`.

**2. Five-way skill-count drift — fixed.** [instrumented] `npm run verify:counts` (b010c4e): 19/19 checks pass at 86/135/99. `grep -n "\b79\b" app/ lib/` in get-orbit finds it only in code-comment history; `app/page.tsx:182` now renders `{COUNTS.skills}{" "}lifecycle skills` via a variable, not the old array-join literal, so "79lifecycle" can't recur even on a stale count. Live homepage unchanged (get-orbit hasn't redeployed) — fix is real, visible only after Justin's merge+publish.

**3. Stripo raw-env-var message — queued, unshipped, as designed.** [instrumented] `grep -n "ORBIT_STRIPO_REST_API_TOKEN" server/stripo-emails.js:258,278`: unchanged, still says "set" an env var instead of `Settings → Extensions → Orbit → Configure`, used correctly elsewhere (`stripo-onboarding.js:470`). R4 explicitly deferred this; nothing silently dropped.

**Doubt point walked forward:** packed-bundle manifest description now opens "86 skills and 135 tools" — door #1 fixed too. Next doubt [judgement]: `get-orbit/lib/orbit-version.ts` still hardcodes `LATEST_MCPB_VERSION = "0.38.0"`, one release behind — by design (15-min sync, hasn't run against this unpublished build), but worth confirming the sync actually fires on first real publish.

[judgement] I agree.

Five rounds taught me that a finding surviving three prior cycles isn't a harder bug — it's a smaller one nobody re-opened the file to check on.
