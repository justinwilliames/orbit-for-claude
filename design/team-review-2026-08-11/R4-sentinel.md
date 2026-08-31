> Personas are fictional cognitive frames — see pulsar-team SKILL.md §1. Nothing here is a statement by or about a real person.

# R4 — Sentinel

Cycle 4. Principal engineer / data analyst lens: security, QA, build and release
integrity, tests that exercise failure modes, observability, and whether a number
measures what it claims.

The suite is green and it means something now.

```
$ npm test
ℹ tests 467
ℹ suites 79
ℹ pass 467
ℹ fail 0
  546 passed · 0 failed · 546 total
```

R3's four findings all got real fixes. `62dacc4` replaced the ten-entry allowlist
with a classified vocabulary of seventy-plus and a drift guard that greps every
`status:` literal out of `server/` and fails on an unclassified one — and the guard
has already caught one in anger (`tests/outputs/…/contract-results.json:2306`:
`unexpected status "bogus_untracked"`). `8d81a06` fixed the nag gate that could
never fire. `82bbddf` added a contrast suite that computes WCAG from the shipped
`tokens.js` rather than a hand-copied table.

Things I went looking for and did **not** find, said out loud rather than padded
into findings:

- **The three privacy toggles are actually wired.** `manifest.json` maps
  `enable_telemetry`/`enable_update_check`/`enable_debug_trace` to
  `ORBIT_TELEMETRY`/`ORBIT_UPDATE_CHECK`/`ORBIT_DEBUG_TRACE`, and each reader
  handles the string the MCPB host actually injects: the two opt-outs accept
  `false`, the opt-in accepts `true`. A checkbox that silently does nothing is the
  classic version of this bug and it isn't here.
- **The widgets don't have an XSS hole.** Every interpolation goes through an
  `esc()` that escapes `& < > " '`, and both srcdoc iframes are
  `sandbox="allow-same-origin"` **without** `allow-scripts` — so the user's own
  email HTML renders but cannot execute. That's the correct pair, and the comment
  at `render-gate.js:34` shows it was reasoned about rather than stumbled into.
- **The registry publish chain is hardened properly.** `build-server-json.mjs`
  stamps the sha256 from the released bytes, the publish step refuses to run
  without a token, and a live readback loop asserts the registry serves the
  checksum it just stamped. That is a claim followed by an observation, which is
  the whole discipline.
- **The build's bridge assertion is real.** `scripts/build-extension.js` resolves
  `@modelcontextprotocol/ext-apps/app-with-deps` *from inside `.mcpb-build`* and
  exits 1 if it can't — the only way to catch a failure that hides behind the
  repo's own `node_modules`.
- **`.notif-head` isn't a contrast bug.** It's the one `.notif` rule the new suite
  doesn't enumerate; I computed it anyway — `#5b6072` on the composited card
  `#edeef0` is **5.38:1**, clear of the 4.5 floor. No finding.

Four things nobody has caught, plus one low-severity note.

---

## 1. The nag re-nags the moment you do what it asked — for 24 hours

`8d81a06` fixed `getVersionNag()`'s gate. It did not fix the cache the gate reads
from, and the cache is not keyed by the installed version.

`startVersionNag()` persists `{at, result}` to `~/.orbit/version-cache.json` with a
24-hour TTL, and `readCache()` returns it and **short-circuits before
`checkOrbitVersion()` runs**. `result` embeds the `installed_version` it was
computed against. So the sequence is:

1. User on 0.27.8 boots. Cache written: `update_available`, installed 0.27.8,
   latest 0.28.0.
2. Nag fires. User does exactly what it asks — downloads and installs 0.28.0.
3. User restarts Claude. The cache is minutes old, well inside TTL. No network
   call is made. The nag fires again.

Instrumented, against the real module with a temp `$HOME`:

```
$ node scratchpad/s4/nagcache.mjs
installed now: 0.28.0
nag returned: {
  "update_available": true,
  "installed_version": "0.27.8",
  "latest_version": "0.28.0",
  ...
  "notes": "Orbit v0.28.0 is available (you're on v0.27.8) — and Orbit is now
            free: no account, no licence key, every tool unlocked. …"
}
network call made?: no — readCache() short-circuited before checkOrbitVersion()
```

The message a stranger sees, on an install that is already current, is that they
are on 0.27.8 and should go download 0.28.0. It persists across restarts for up to
24 hours, because nothing invalidates the cache and nothing re-checks.

Why this one matters more than its size: the nag is the **only push channel Orbit
has** to an install that already exists, and the news it carries is the relaunch.
The relaunch is the single event where every existing install updates at once —
which is precisely the window in which this fires, for everybody, in the same day.
The first impression of "Orbit is free now" becomes "Orbit can't tell what version
I'm running."

`tests/suites/32-version-nag.test.mjs` cannot catch it: every test seeds the
in-memory cache via `_seedVersionNagForTest`. `startVersionNag`, `readCache` and
`writeCache` — the whole disk path — are never executed by the suite.

**Fix** (one line plus a test): in `readCache()`, take the installed version and
discard a cache entry whose `result.installed_version` doesn't match it —

```js
function readCache(installedVersion) {
  …
  if (raw?.result?.installed_version !== installedVersion) return null;
  …
}
```

and add a `32-version-nag` case that writes a real cache file under a temp `$HOME`,
calls `startVersionNag({installedVersion: <newer>})`, and asserts silence.

---

## 2. The version check's failure path still hands the user the login wall

`c45228b`/`8d81a06` fixed `download_url` and `suggested_next_steps` in the *success*
branch of `server/version-check.js` — and left the *error* branch untouched, twelve
lines above the comment congratulating the fix.

`server/version-check.js:57`:

```js
"Visit https://yourorbit.team/account/downloads to see the latest release."
```

Instrumented:

```
$ curl -sI https://yourorbit.team/account/downloads
account/downloads -> 307 https://yourorbit.team/account/login?redirect=/account/downloads
$ curl -sI https://yourorbit.team/downloads
downloads -> 200
```

This is the string Claude reads out when the version endpoint is unreachable — the
one moment the user has no other route to a build. It sends them to the account
wall this entire release exists to demolish. `grep -rn "account/downloads"` returns
exactly one hit in the whole repo, so the fix is a single word.

**Fix:** `server/version-check.js:57` → `https://yourorbit.team/downloads`, and add
the URL to whatever guard already asserts the plural in the nag test (`32-version-nag`
already does `assert.match(nag.download_url, /yourorbit\.team\/downloads$/)` — extend
it over `checkOrbitVersion`'s error payload).

---

## 3. The brand-new bug-report door has a 404 nailed to it

`8d81a06` gave Orbit an issue template — the right call, and the form itself is
genuinely good (version, host, `orbit_check_setup`, trace log; four fields, most
bugs diagnosable without a follow-up). Then `config.yml` routes the *other* half of
inbound traffic — "Feature idea or 'does Orbit do X?'" — at a Discussions tab that
does not exist.

```
$ curl -s -o /dev/null -w "%{http_code}" \
    https://github.com/justinwilliames/orbit-for-claude/discussions
404

$ gh repo view justinwilliames/orbit-for-claude --json hasDiscussionsEnabled
{"hasDiscussionsEnabled":false}
```

With 2 unique repo visitors in 14 days, the "does Orbit do X?" question is close to
the only inbound signal that exists, and the chooser page sends it to a 404. It also
reads as abandonment to anyone evaluating whether the project is alive.

**Fix:** `gh api -X PATCH repos/justinwilliames/orbit-for-claude -f has_discussions=true`
(and seed one Q&A thread so the tab isn't empty), or delete the contact link. Either
is a minute. Enabling it is the better answer — a Discussions tab with three answered
questions is the cheapest "this is maintained" signal a stranger can read.

---

## 4. The counts guard names four surfaces and fixes three

`scripts/sync-counts.mjs` is the right instinct — it exists because "60+ skills and
80+ tools" was still on the shelf at 77 and 121. Its own header comment names where
the stale sentence lived:

> …repeated into the README, server.json, the MCP instruction string **and the
> GitHub repo description**…

`TARGETS` is `README.md`, `server.json`, `server/index.js`. The repo description
isn't in it, and nothing else touches it:

```
$ gh repo view justinwilliames/orbit-for-claude --json description -q .description
Lifecycle-marketing OS for Claude Desktop — 60+ battle-tested skills and 80+ tools:
Braze, Stripo, MJML, deliverability, segmentation maths. MCPB bundle · yourorbit.team
```

That line is what GitHub search results render, what the social card renders, and
what anyone skimming a topic page reads. It is the *only* surface in the list that a
stranger sees before deciding to click, and it's the one the guard skips.

Same shape, second instance: the guide count. The generated export says 90; the
install-dialog copy says 80+.

```
$ node -e "…" data/guides-export.json
guides: 90 | courses: 10 | skills: 77 | manifest tools: 121

$ grep -n "80+" manifest.json server/index.js
manifest.json:8:  "…bundles 80+ long-form practitioner guides…"
server/index.js:935: // Long-form guide library — 80+ markdown guides exposed as
```

`manifest.json`'s `long_description` is the text Claude Desktop shows in the install
dialog. It is not in `TARGETS` either, and the guide count is not in `COUNTS` — even
though `data/guides-export.json` is regenerated on every build and cannot lie about
it.

**Fix:** add `guides: guides.length` to `COUNTS`, add a second marker/pattern for
`\d+\+? (?:long-form )?(?:practitioner )?guides` over `manifest.json` and
`server/index.js`, and add a build step (or a one-off, then a note in RELEASING) that
runs `gh repo edit --description "$(node -p 'require("./scripts/sync-counts.mjs")…')"`.
Owner: whoever owns the release script.

---

## 5. (low) The QA widget paints an unvalidated string into a `style` attribute

`server/ui/widgets/qa-report.js:116,118,131`:

```js
'<span class="swatch" style="background:' + esc(s.fg) + '"></span>'
```

`esc()` escapes quotes, so there's no attribute break-out and no XSS — I checked
that first. But `;`, `:` and `url(...)` all survive it, and `s.fg` originates in
whatever colour literal `orbit_qa_email` parsed out of the HTML the user handed it.
A vendor-supplied template carrying `red;background-image:url(https://…/px.gif)` in
a colour slot gets that request made from inside the widget document.

Genuinely low: the source is a document the user chose to QA, the payoff is a
beacon, and a strict host CSP may block it anyway. Filing it because the fix is one
guard and it's the only unvalidated value that reaches a CSS context anywhere in the
UI layer.

**Fix:** validate before interpolating — `/^#[0-9a-f]{3,8}$|^rgba?\([\d\s.,%]+\)$/i`,
else render the raw text in the label and skip the swatch.

---

## Verdict

Engineering is no longer the constraint here. Three cycles of findings have been
closed with fixes that execute the shipped source rather than a copy of it, the test
suite exercises failure modes, and the release chain observes its own claims. What I
found this round is one defect that fires on everybody at the exact moment of the
relaunch (#1), two dead links (#2, #3), and a guard with the wrong scope (#4).
All four are sub-hour fixes.

If nothing else on this list gets done, do #1 and #3. #1 is the difference between
"Orbit is free now" landing as news and landing as a bug; #3 is the difference
between an inbound question reaching a human and reaching a 404.

Will this still be debuggable in six months? Yes — with one caveat. The version-nag
disk cache is the second consecutive defect in a module whose test suite deliberately
stubs out the half that touches the world. Both bugs lived in the unstubbed half.
That's a pattern, not a coincidence.
