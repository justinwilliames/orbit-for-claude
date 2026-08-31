> Personas are fictional cognitive frames — see pulsar-team SKILL.md §1. Nothing here is a statement by or about a real person.

# R3 — Voyager (data / telemetry / falsifiability)

R2's findings landed properly. `spawnMcpClient` now forces `ORBIT_TELEMETRY=0` by
default, the release job sets it too, and the shaped-failure path emits `tool_error`.
I verified both rather than taking the commit message's word for it:

```
$ node scratchpad/voyager-r3-status.mjs      # spawns the real server, sink under my control
check_stripo_auth (no creds)   status=needs_setup   telemetry=tool_call,tool_error/needs_setup
```

That was broken last round and is fixed now. Good.

So this round I went looking at the two things nobody has pointed an instrument at: the
*other* call Orbit makes on its own behalf, and whether the failure allowlist that fix
introduced actually covers Orbit's failures. One of them is the finding of the round.

---

## 1. The update nag has never fired. Not once, on any install, since the day it was written.

`server/version-nag.js:95` is the gate:

```js
export function getVersionNag() {
  if (!cached) return null;
  if (cached.update_available !== true || !cached.latest_version) return null;
```

`cached` is whatever `checkOrbitVersion()` returned (`version-nag.js:71`, or the disk
cache at `~/.orbit/version-cache.json`). Here is every field `checkOrbitVersion()`
returns (`server/version-check.js:76-90`):

```
status, installed_version, latest_version, source, message, download_url, suggested_next_steps
```

There is no `update_available`. There has never been one — `git log -S'update_available: true' -- server/version-check.js`
returns nothing, and the field appears in exactly two places in the whole repo, both
inside `version-nag.js` itself. The producer says `status: "update_available"`. The
consumer reads a boolean field named `update_available`. They have never agreed.

Measured, not reasoned. I seeded the disk cache with the verbatim object the real
`writeCache()` persists when an update exists, then asked:

```
$ node scratchpad/voyager-r3-nag.mjs
cached result written by the real writeCache shape: "update_available"
getVersionNag() -> null
```

`null`. So `makeJsonToolResponse` (`server/index.js:5899`) never attaches `_orbit_update`,
and no tool response has ever carried an update notice to any user.

Why this is the finding and not a footnote. The pull path works fine — a user who asks
"am I up to date" gets a correct answer from `orbit_check_version`. It is the *push* path
that is dead, and the push path is the entire point. The code's own comment, written in
the most recent commit on this branch, says so:

> "This nag is also the only channel that reaches an existing install, so it carries the news."

The news being carried is `Orbit is now free: no account, no licence key, every tool
unlocked`. Every human who ever installed the $249 build — the only people on earth who
have demonstrated they want this thing — is sitting behind a gate that returns null. The
relaunch has a megaphone and it is not plugged in. Commit `ba1bf34` correctly fixed the
`/downloads` vs `/download` redirect inside that notice: the right URL, in a string
nothing renders.

There is also a `_resetVersionNagForTest()` export whose docstring says it exists "so unit
tests can verify both surfaced-once behavior and latest-version-no-notice behavior."
`grep -rn "getVersionNag" tests/` returns nothing. The helper was written for a test that
was never written, which is how a two-line contract mismatch survives seven months and a
full engineering review round.

**Fix** (Sentinel or Nova, ten minutes): gate on `cached.status === "update_available"`,
or have `checkOrbitVersion` also return the boolean. Then the test the reset helper was
built for: seed a cache, assert a notice; seed an up-to-date cache, assert null; call
twice, assert once. Ship it before the relaunch announcement, because this is the
announcement's only owned distribution channel.

---

## 2. Telemetry off still phones yourorbit.team — and the README says that call does not exist

`startVersionNag()` fires at module load (`server/index.js:386`), before any tool runs,
gated on nothing. I hooked `globalThis.fetch` and ran the real server on a fresh HOME with
telemetry explicitly disabled:

```
$ HOME=$(mktemp -d) ORBIT_TELEMETRY=0 node --import fetch-hook.mjs server/index.js
[Orbit] Registered 90 guide resources (5 categories) from export 2026-08-02T11:06:10.975Z.
[Orbit] Registered 10 course resources from export 2026-08-02T11:06:11.014Z.
[NET] GET https://yourorbit.team/api/orbit/latest-version
```

One outbound call, to Justin's server, from a user who opted out of everything there is to
opt out of. It is a bare GET with no identifiers — genuinely low-harm — but it is a hit
Justin's origin sees, from an install that believes it went dark.

The problem is what the repo says about it. `README.md:53`:

> "It is the only network call Orbit makes on its own behalf; everything else goes to a platform you configured."

And `PRIVACY.md`, under *Everything else Orbit talks to*:

> "Orbit's other network calls all go to a platform *you* configured … Orbit is not a proxy — nothing routes through yourorbit.team."

Both false, by one call, on every session. PRIVACY.md exists because someone decided that
"free, no account, no signup" and an undisclosed call home do not belong in the same
product. I agree with that person. This is the same product with a second undisclosed call
home, and the page that promises otherwise is the page a suspicious stranger reads before
starring a repo that does email automation with their Braze key.

Same page, smaller: the published `errorClass` closed set lists six values
(`timeout, upstream_unavailable, auth_failed, not_found, rate_limited, error`). On the wire
I observed `needs_setup` and `invalid_args`, neither published. `server/telemetry.js`'s own
header documents the wider vocabulary; PRIVACY.md was not updated alongside it. The
disclosure is now a subset of what ships, which is the direction that costs trust.

**Fix**: three sentences in PRIVACY.md's "Everything else" section naming the version
check, its URL, its 24-hour disk cache, and the fact that it carries no identifiers; one
clause in README.md:53; refresh the errorClass list from `FAILURE_STATUSES`. Then an
explicit `ORBIT_UPDATE_CHECK=0` for people who want silence. Do **not** fold the version
check into `ORBIT_TELEMETRY=0` — after finding 1 is fixed it is the only push channel Orbit
has, and killing it for the privacy-conscious is the wrong trade. Disclose it, don't
disable it.

---

## 3. The failure allowlist covers 11 of 70 statuses, and one of the misses is a credential gap

`FAILURE_STATUSES` (`server/index.js:5993`) is the R2 fix: a shaped `{status: "..."}`
response whose status is in the set fires `tool_error` alongside `tool_call`. Sound
mechanism. The set has 11 members. The server emits 70 distinct statuses:

```
$ node -e '<count distinct `status: "..."` literals in server/>'
distinct statuses emitted: 70
in FAILURE_STATUSES: 11 (incl. "error")
failure-shaped but UNLISTED (38):
created_gen_area_missing, fetch_error, file_not_found, file_too_large, gen_area_missing,
html_missing, html_not_extractable, invalid_composition, invalid_master_template_id,
invalid_platform_logic, invalid_ref, missing, missing_components, module_list_failed,
module_not_found, modules_not_found, needs_approval, needs_assets, needs_attention,
needs_components, needs_confirmation, needs_copy_confirmation, needs_discovery,
needs_inputs, needs_platform_confirmation, no_buttons_found, no_collision, no_fixer,
no_markup, no_module_a, no_modules, overrides_not_pushable, partial, push_not_configured,
slot_values_invalid, unresolved, unsupported, unsupported_platform
```

Some of those are honest non-failures — `needs_approval`, `no_collision`,
`needs_confirmation` are successful answers that happen to be negative. Perhaps twenty are
real failures. Live, against a sink I control:

```
build_braze_pack (non-braze)   status=unsupported_platform   telemetry=tool_call
check_stripo_auth (no creds)   status=needs_setup            telemetry=tool_call,tool_error/needs_setup
```

Same wrapper, same shape, one refusal counted as a clean success. And `push_not_configured`
(`server/stripo-compose.js`) is a *missing-credential* state — the precise class the R2 fix
was written to catch — sitting outside the set.

Two members of that list deserve their own sentence. `partial` and `continuation_required`
are the paused-job states: `orbit_audit_braze_instance` and friends hand back a
`continuation_token` and stop. If the user never says "continue" — and continuations die on
an Orbit restart, which is most of them — that abandoned run is recorded byte-for-byte
identically to one that finished. The instrument cannot tell a completed audit from one the
user walked away from, which is the single most interesting thing about a long-running tool.

`grep -rn "FAILURE_STATUSES" tests/` returns nothing. There is no guard, so the set decays
silently every time someone invents a status — and the codebase invents them freely, 70 of
them so far.

**Fix**: the guard, not the list. A test that extracts every `status: "<literal>"` from
`server/` and asserts each appears in exactly one of two named sets — SUCCESS or FAILURE —
failing on anything unclassified. Same shape as the manifest-drift guard already in the
suite, and it makes the next status a compile-time decision instead of a silent
mis-measurement. Add `push_not_configured`, `file_not_found`, `module_not_found`,
`modules_not_found`, `fetch_error`, `unsupported_platform`, `unsupported`,
`invalid_master_template_id`, `invalid_composition`, `slot_values_invalid`,
`missing_components`, `html_missing`, `file_too_large`, `invalid_ref` to FAILURE now.
`partial` wants its own answer and I'd rather it be argued than defaulted.

---

## What I looked at and found nothing worth filing

- **Continuation registry** (`server/continuation.js`). `enforceCap()` evicts by Map
  insertion order while `updateCheckpoint()` refreshes `created_at` without reinserting, so
  eviction order and age diverge, and an `in_use` checkpoint can be evicted mid-resume. All
  true; all requires 20 concurrent checkpoints across three Braze-credentialled tools. At
  thirteen installs this is not a finding, it is trivia. Noting it here so the next reviewer
  doesn't spend the hour I did.
- **`/api/orbit/latest-version` as an install-liveness metric.** Tempting — it is
  opt-out-immune and once-per-24h, which is a better retention signal than anything in
  `mcp_telemetry`. Dead end: the route sets `s-maxage=300`, so the CDN absorbs nearly all of
  it and the origin sees ~288 hits a day regardless of how many installs exist. Not fixable
  without deliberately defeating the cache, which is worse than not knowing.
- **The release pipeline.** Registry stamp, sha256 readback, `ORBIT_TELEMETRY=0` on the test
  step — it does what R1/R2 asked. I have nothing.

---

Voyager out. Two of the three above are ten-minute fixes and one of them is the only way
anyone who already installed Orbit will ever hear that it stopped costing $249.
