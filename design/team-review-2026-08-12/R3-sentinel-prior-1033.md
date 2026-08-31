> Personas are fictional cognitive frames — see pulsar-team SKILL.md §1. Nothing here is a statement by or about a real person.

# R3 — Sentinel

Baseline first, because a review that doesn't run the thing is a review of a
summary. `npm test` on `team-review-round-2`:

```
ℹ tests 606
ℹ suites 95
ℹ pass 606
ℹ fail 0
  701 passed · 0 failed · 701 total
```

Green, and genuinely green — I checked one of the newest gates against the
outside world rather than against itself. The published v0.29.0 asset hashes to
`34cfae6f5b7e82e5dec2ab14c8da4fca6384dc069698827a21e9d138d09c06e1`, and the live
registry entry claims exactly that. The checksum work holds. The generated
`build/gate.sh` also holds — I generated one, ran it against two real production
emails from lifecycle-brain (PASS), then planted an orphan href, a duplicate CTA
label and a `width="900"` table and watched each check fail and exit 1. That is
a gate that exercises its failure modes. Credit taken.

Now the four things nobody has caught.

---

## 1. `orbit_client_sim` returns exactly one document on a normal-sized email — the one you handed it

The commit message for `f104b9a` reads: *"the tool that exists to stop you
measuring one document was returning one document."* It still is. The class it
returns just changed.

`server/client-sim.js` spends a `DOCUMENT_BUDGET_BYTES = 55_000` budget in class
order, and `full` — the caller's own input, echoed back — is first in
`CLASS_NAMES`. On a 35 KB email it eats the entire budget and the three
documents the tool exists to produce are withheld:

```
authored bytes 35300
  full                 HTML EMITTED (35300B)
  nocss                WITHHELD
  gmailish             WITHHELD
  gmailish_worstcase   WITHHELD
  imgoff               dedup of full
  reduced              dedup of full
  nohover              dedup of full
serialised response bytes 42035 cap 100000
```

Note the last line. The full response serialises to 42 KB against a 100 KB cap
(`DEFAULT_RESPONSE_MAX_BYTES`, server/index.js:6263). The budget threw away
three documents to protect 58 KB of headroom that was never at risk.

At 80 KB — still inside Gmail's ~102 KB clip and utterly ordinary for a promo
email — **no invocation returns any markup at all**:

```
bytes 80583
["full"]          -> full:WITHHELD
["full","nocss"]  -> full:WITHHELD nocss:WITHHELD
["nocss"]         -> nocss:WITHHELD
```

And the escape hatch it prints is a literal bug. `withheld[0]` is `full`, so:

```
Re-run orbit_client_sim with classes: ["full", "full"] to get that pair.
```

Status is `ok` throughout.

The widget compounds it. `server/ui/widgets/client-matrix.js:330` draws
"⊘ nothing to render — The tool returned no document for this class — run it
with `include_html:true`", but `include_html` defaults to `true`; the document
was withheld by the budget, and the variant carries an `html_withheld: true`
flag the widget never reads. A user following that advice changes nothing.

This is the flagship "my email breaks in Gmail" surface. A stranger who arrives
with a real email gets the document they already had.

**Fix**: never spend budget echoing `full` back (the caller supplied it — emit
it only when explicitly the sole requested class); size the budget against the
serialised response, not raw bytes; make `withheld[0]` pick a non-baseline
class; and have `mountFrame` read `html_withheld` and say the real reason.

---

## 2. The guard against re-releasing a published version fails open on any curl error

`1b4a075` added exactly the right check, then wired it the way the last three
of these bugs were wired. `.github/workflows/build-mcpb.yml:168`:

```bash
BODY=$(curl -fsS ".../v0/servers/${ENC}/versions" || echo '')
```

`|| echo ''` under `set -euo pipefail` converts every transport failure — 404,
DNS, registry outage, rate limit, a rename that changes the path — into "not
published, safe to proceed." I ran the guard's own body against a path that 404s,
with `VERSION=0.29.0`, which *is* published:

```
curl: (56) The requested URL returned error: 404
GUARD SAID: Version 0.29.0 is not yet on the registry — safe to publish.
exit=0
```

What it then permits is not recoverable: `gh release upload --clobber` replaces
the public bytes of a version whose registry entry is immutable, the readback
fails *after* the swap, and the registry is left describing a file that is no
longer at that URL. On the one channel built for strangers.

The bitter part is that the same file, 88 lines later, says:
`# No `|| echo` here. A swallowed publish failure is exactly the bug this step
was written to fix, relocated into YAML where it is harder to notice.` The
author saw the shape and put it back upstream of the sentence.

(The *verify* step at line 343 uses the same `|| echo ''` but terminates in
`exit 1` after five attempts — fail-closed, fine.)

**Fix**: drop `|| echo ''`, or keep it and add `if [ -z "$BODY" ]; then exit 1;
fi`. Two lines.

---

## 3. The router is blind to four of the six ESPs Orbit ships, in both directions

`8c7b8ef` fixed "the Braze skills were invisible to the router that names them."
The identical bug is still live for every non-Braze ESP, and Orbit ships adapters
for six (`server/esp/`: braze, iterable, customerio, klaviyo, mailchimp, sfmc)
plus five documentation-expert skills.

Two arrays, both four entries long:

- `server/catalog.js:3` — `PLATFORM_NAMES = ["braze","iterable","hubspot","posthog"]`
  decides whether the *request* names a platform.
- `server/build-skill-manifest.js` — `PLATFORM_FROM_NAME` has the same four rows,
  so `klaviyo-documentation-expert` ships with `platform_sensitivity.supported_platforms: []`.

So a request that names Klaviyo can never set the platform signal, and the
Klaviyo skill can never earn the platform bonus. What the user gets instead is
the configured default, asserted as fact. Live, via the connected server:

> `orbit_route_task("I use Klaviyo for my Shopify store. Help me build an
> abandoned cart flow.")`
> → `primarySkill: "lifecycle-design"`, alternatives include
> `braze-build-packager`, every ranked reason includes **"Fits the braze
> platform context."**, `detectedSignals: { platform: "braze", platform_source:
> "config" }`. The word Klaviyo is not detected anywhere in the output, and
> `disambiguators` never asks which platform.

> `orbit_route_task("Set up a Mailchimp welcome automation for my newsletter")`
> → `primarySkill: "crm-data-model"` (score 14, matched keyword: `"automation"`),
> all three results reasoned **"Fits the braze platform context."**

The sharpest one. `data/skills.manifest.json` lists, as a verbatim trigger
phrase for `klaviyo-documentation-expert`, the string
`"write this klaviyo template tag"`. I asked:

> `orbit_route_task("How do I write a Klaviyo template tag for a product block?")`
> → `email-production-system`, `braze-build-packager`, `program-brief`.
> `klaviyo-documentation-expert` does not appear. Reason line on #2: "Fits the
> braze platform context."

`orbit_route_task` is step 1 of the server instructions Claude is told to follow
before any lifecycle work. Every non-Braze stranger is silently routed into
Braze protocol, confidently, with a reason string that names a platform they
never mentioned — and five shipped skills are unreachable by the users they were
written for.

`tests/suites/39-skill-routing.test.mjs` is exactly the shape that lets this
live: `test("every braze-* skill declares Braze support")` and four Braze routing
assertions. No klaviyo, mailchimp, customerio or sfmc case. A test suite that
passes without exercising a single failure mode.

**Fix**: add klaviyo / mailchimp / customerio (+ "customer.io") / sfmc (+
"salesforce marketing cloud") to both arrays; when the request names a platform
that differs from the configured default, surface the conflict rather than
silently substituting (`detectPlatformConflicts` already exists in
`lifecycle-diagrams.js:1349` — reuse it); and parameterise the routing test over
all six ESPs.

---

## 4. The generated `gate.sh` tells its user to use output that `orbit_liquid_state_matrix` does not return

Every generated brain carries this in its own gate header
(`server/brain/gate-generator.js`):

> *"Orbit's `orbit_liquid_state_matrix` tool does that resolution: it enumerates
> every personalisation state of the compiled file and hands back one rendered
> document per state. ... Compile and resolve upstream of this script, then run
> the gate once per resolved branch."*

It does not hand back documents. Run against a real 62 KB Liquid-bearing
production email:

```
top-level keys: status, verdict, axes, states_rendered, arms, findings, summary, message
states_rendered: 64
serialised bytes: 1663
```

64 states rendered, zero returned. The tool renders internally and discards. So
the instruction the generated gate gives every brain owner — run me once per
resolved branch — has no reachable input.

Worth saying: the tool itself did its job. On that email it caught a genuinely
unbound token (`{{canvas.${name}}`, invariant B) that the compile had shipped.
The defect is the promise in the gate header, not the tool.

**Fix**: either add an `emit_states` / `write_states_to` option so the resolved
documents are obtainable, or rewrite the gate header to describe what the tool
actually returns and how a user would really get one document per branch.

---

## What I looked at and cleared

- Release pipeline end to end: OIDC publish, `validate` before `login`,
  deprecation readback, the five-attempt versions readback, `--latest` gated on
  it. All fail-closed except the one above.
- Registry state: `search=braze` returns four rows, all
  `io.github.justinwilliames/braze-lifecycle-mcp`, all `active` — one per
  version, which is the registry's shape, not a bug.
- Generated `gate.sh`: precondition, byte-clip, overflow, orphan-link,
  CTA-parity — all four exercised with planted defects, all four fired.
- `calculators.js` two-proportion z-test and sample sizing: formulas correct,
  `confidence_level` schema-bounded to 0–1 so the percent-vs-fraction trap that
  would make `significant` permanently false is closed.
- `path-safety.js` has no direct test and does not `realpath`, so a symlink
  inside a permitted root escapes it — but every caller passes no root and the
  MCPB runs locally by design. Noted, not filed.
- The 33 MB `@biomejs/wasm-nodejs` still riding in a 37 MB download is already
  on the board twice. Not re-filed.
