> Personas are fictional cognitive frames — see pulsar-team SKILL.md §1. Nothing here is a statement by or about a real person.

# R4 — Pulsar, Chief of Staff (cycle 4, 13 Aug 2026)

I read `FINAL-SHIPPING-DECISION.md`, my own R1/R3 files, the three prior audits,
and my own R4 action plan from cycle 2 before touching a file. Everything below
was run today at this seat. Where I re-derived something a drone had already
filed, I dropped it rather than re-file it — the already-known list is 130-odd
ids long and re-filing is the expensive failure mode of this loop, not the cheap
one.

Two findings. Both are the shape the brief told us to hunt — **a step that
reports SUCCESS while being wrong** — and both sit on the flagship path, which
is the only reason they clear my bar. Everything else I chased was either
already disposed of or too small to be worth Justin's money.

---

## What I checked and found healthy (so nobody spends a lens on it again)

Being explicit, because a round that only reports breakage stops being
readable.

```
$ curl .../v0/servers/io.github.justinwilliames%2Fbraze-lifecycle-mcp/versions
  0.29.1 active isLatest=True  sha 790d93d3…
  0.29.0 / 0.28.5 / 0.28.4 / 0.28.3 active, isLatest=False
$ curl -sSI https://github.com/justinwilliames/orbit-for-claude/releases/latest
  302 → /releases/tag/v0.29.1
$ gh release list  →  v0.29.1  Latest
$ curl https://yourorbit.team/api/orbit/latest-version  →  "version": "0.29.1"
```

The release ordering fix landed and works. The registry, the GitHub "latest"
pointer, and the site's version API all agree on 0.29.1 — three independent
observations, no drift. The `Promote to latest` step is doing exactly the job it
was moved for. I went looking for a hole in that chain and there isn't one.

I also ran the **whole flagship chain end to end** on a realistic Braze email —
generate gate → state matrix with `write_states_to` → run the generated gate over
each written branch:

```
verdict= pass  states= 2  files= 2
--- big-states/state-000-vip-true.html (1912 bytes)
gate: [byte-clip] PASS · [overflow] PASS · [orphan-link] PASS · [CTA-parity] PASS
gate: PASS — layout/structure clean.   exit=0
--- big-states/state-001-none.html      exit=0
```

For a Braze-bound email the chain is now real. It was not real yesterday. That
is a genuine improvement and it deserves saying before I say what is still
wrong with it.

The gate's own precondition also holds under the failure I tried to induce: a
missing file exits 2, so the `|| exit 1` in the printed loop fires rather than
silently passing an empty glob. That terminal link was the first thing I went
after and it is closed.

---

## Finding 1 — the branch matrix reports "no branches" for four of the six ESPs Orbit ships

`orbit_liquid_state_matrix` is named **by name, in the header of every
`build/gate.sh` Orbit generates**, as the thing that resolves a templated email
into per-branch documents. Its axis discovery
(`server/liquid-resolve.js:373-409`) recognises exactly two dialects: Braze
`${…}` / `custom_attribute.${…}` / `campaign.${…}`, and Klaviyo
`person|event|organization.x`. Nothing else is a token, so nothing else becomes
an axis.

Eight dialects through the real function:

```
braze ${} (supported)                status=ok verdict=fail        axes=1 states=2 output_files=2
braze custom_attribute (supported)   status=ok verdict=fail        axes=1 states=2 output_files=2
klaviyo person.x (supported)         status=ok verdict=fail        axes=1 states=2 output_files=2
PLAIN LIQUID {% if var %}            status=ok verdict=no_branches axes=0 states=- output_files=ABSENT
customer.io {{customer.x}}           status=ok verdict=no_branches axes=0 states=- output_files=ABSENT
mailchimp *|MERGE|*                  status=ok verdict=no_branches axes=0 states=- output_files=ABSENT
iterable handlebars {{#if}}          status=ok verdict=no_branches axes=0 states=- output_files=ABSENT
sfmc ampscript %%[IF]%%              status=ok verdict=no_branches axes=0 states=- output_files=ABSENT
```

`REGISTERED_PLATFORMS` in `server/esp/registry.js:36-43` is braze, iterable,
customerio, klaviyo, mailchimp, sfmc. Four of those six get `no_branches` on a
template with a live `{% if %}` and two mutually exclusive modules in it.

The reason this is the hunted shape and not merely a gap: the returned message
asserts a fact about the **template** when what it observed is a fact about the
**detector**.

> "No personalisation binding drives a conditional in this template, so there is
> exactly one state and nothing to enumerate."

That sentence is false for five of the eight inputs above. It is careful enough
to add "That is a fact about the template, not a pass" — which makes it *more*
convincing, not less, because the caveat implies the detector was sure. A
Customer.io user runs the recipe printed into their own gate, gets a clean
`status: ok`, and reasonably concludes their email has no branches to cover. It
has two.

Two smaller things fall out of the same path and should be fixed in the same
commit:

- `output_files` is **ABSENT**, not `null`, on the `no_branches` return. The
  commit that added it (3f368b3) states its own contract as *"Without the
  argument `output_files` is explicitly null rather than absent — the reader
  should be able to tell 'kept nothing' from 'wrote nothing'."* On this path the
  reader can tell neither, and this is the path most non-Braze users land on.
- `write_states_to` is resolved with bare `path.resolve()`
  (`server/liquid-state-matrix.js`, the `stateDir` line), not the repo's own
  `resolveSafe` from `server/path-safety.js` that every other file-writing brain
  tool uses. `path.resolve` is relative to the server process's cwd, which for
  an MCPB launched by Claude Desktop is not the user's brain repo — and the gate
  header's printed recipe passes the **relative** `"build/states"`. The returned
  `next_step` correctly prints the absolute directory, so the two disagree.

**Fix.** Either teach `personalisationTokens` the plain-Liquid and Handlebars
forms (`{% if bare_ident %}`, `{{ bare_ident }}`, `{{#if x}}`) — which is the
useful answer, because plain Liquid is Customer.io and Iterable's native shape —
or, at minimum, make the abstention honest: when zero axes are found *and* the
document contains conditional syntax the detector does not model, return
`needs_inputs` naming the dialects it can see and pointing at `variables_json`
as the manual override. Do not return a verdict whose name is a claim about the
input. Ship the dialect matrix above as the test fixture; a control that only
ever feeds it Braze syntax is how this survived four cycles.

**Owner:** Voyager. **Effort:** 2h with the fixture matrix.
**Reversibility:** high — additive regexes plus one verdict branch.

---

## Finding 2 — `orbit_generate_brain_gate` destroys the user's edits and reports it as an upgrade

Flagship step 3. The module's own docblock (`server/brain/gate-generator.js:25`)
says *"Refuses to overwrite an existing file (report-and-skip)."* It does not.

`writeGenerated` (`server/brain/verified-claims.js:86-115`) classifies three
ways: marker absent → `hand_edited`, leave alone; content byte-identical →
`unchanged`; **content differs and marker present → overwrite, push to
`upgraded`.** There is no fourth case, and the third one swallows the one that
matters.

I generated a gate, made the two edits a real owner makes — tightened the clip
threshold and added a house rule — and regenerated:

```
upgraded: [{"path":".../build/gate.sh","from":2,"to":2}]
hand_edited: [] skipped: []
user's CLIP_BYTES=61440 survived?  false
user's extra rule survived?       false
```

An **upgrade from generation 2 to generation 2**. `from === to` is a provably
impossible upgrade and nothing asserts against it. The user's threshold and
their added check are gone, no backup, and the tool's report says the operation
improved their file.

The marker was introduced last cycle precisely to answer "did Orbit write this,
or did a human?" — and the docblock states the answer as *"hand_edited — no
marker, so a human wrote or edited it."* That premise is wrong in the direction
that costs data: **a human editing an Orbit-generated script keeps the header.**
Nobody deletes the shebang block to add a check. So the only edits the guard
protects are the ones nobody makes, and every edit anyone actually makes is
classified as Orbit's own and destroyed.

The docblock even names the tension and resolves it the wrong way: *"The rewrite
triggers on CONTENT, not just on the generation number: a regenerate with a
different clip_kb has to land."* True — but at `found === SCRIPT_GENERATION` the
two cases are perfectly distinguishable and the code never asks. If the caller
passed no changed parameters and the generation is current, a content difference
can only be a human edit.

This is one product holding two opposite write policies twenty lines apart:
`writeSkip` (`verified-claims.js:60-69`) refuses to touch anything that exists
and reports `skipped`; `writeGenerated` overwrites and reports success. The
destructive one is on the flagship step and also generates
`build/check-claims.sh` (`verified-claims.js:345`), so the same trap eats a
second file.

**Fix.** In `writeGenerated`: only rewrite when `found < SCRIPT_GENERATION`, and
assert `from < to` before anything is labelled `upgraded`. When `found ===
SCRIPT_GENERATION` and the content differs, split on intent — caller supplied
parameters that differ from what is on disk → rewrite and report
`reparameterised` with the old and new values; caller supplied nothing new →
report a new `modified` outcome, leave the file alone, and name `overwrite:
true` in the message. Test: generate, append a line, regenerate, assert the line
survives and the outcome is not `upgraded`.

**Owner:** Sentinel. **Effort:** 1.5h with the negative test.
**Reversibility:** total — one function, additive outcome string, and the only
callers are Orbit's own two generators.

---

## What I looked at and deliberately did not file

- **The account wall on `yourorbit.team/api/mcpb-download`.** Live 401 today:
  `{"error":"account_required"}`. The wall, its copy, and the sign-up redirect
  are all already-known ids from this round, so I am not re-filing them. But
  one sequencing consequence is worth recording rather than filing: this round's
  own brief asserts as settled state that *"an anonymous download from
  yourorbit.team returns it"*, and that has been false since this morning. The
  README, the registry entry and the GitHub release are still anonymous and
  still correct — so the walled door is the one surface a stranger does **not**
  need. The wall is a strategic answer to *Decision needed #2* from cycle 2
  ("what is free for?"), which is still unanswered in prose. A decision that
  ships as a commit before it exists as a sentence is the specific thing this
  seat is supposed to catch, and I am flagging it as a decision, not a defect.
- **`build-swallows-sync-exit-code`.** Still live in
  `scripts/build-extension.js:36-51` — both `catch {}` blocks assert a specific
  outcome ("annotations were stale and have been rewritten") for *any* failure
  of the child process, including a crash. I deferred it in cycle 2 as low and
  it is still low; it is an already-known id and re-filing it buys nothing.
  Fold it into whatever touches that script next.
- **The test runner, the audit workflow, the republish guard, the checksum
  stamper, the widget bundling path.** Read them all hunting the same shape.
  `server/ui/**` is statically imported by `register.js`, so esbuild bundles it —
  no missing-widget trap. The republish guard's unreachable-registry branch
  refuses rather than waves through. The stamper compares the bundled
  `manifest.json` version against the one it is stamping and exits 1 on
  mismatch. Nothing to report is the correct report on all five.

---

*— Pulsar, 13 Aug 2026. Both findings are on the flagship chain, both have a
named owner, both are under two hours, and both are reversible. The rest of what
I looked at is either fixed or already on somebody's list.*
