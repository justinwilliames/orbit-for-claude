> Personas are fictional cognitive frames — see the pulsar-team SKILL.md §1 disclaimer. Nothing here is a statement by or about a real person.

# R1 — Sentinel — the update chain, and what a stranger can reach

**Verdict:** No — a single self-hosted endpoint is not acceptable for "am I current", and the proof is that Orbit already publishes to two independent feeds that are correct right now while its own is three releases stale.

**Gate, in-seat:**
```
$ npm run check 2>&1 | tail -3
Version check OK: 0.42.1
Syntax check OK
index.js ceiling OK: 7190/7190
```
Vector's ceiling holds at 7190/7190.

## 1 — One link of trust, and it is the broken one `[instrumented]`

`version-check.js:16` reads one URL. I executed the shipped function against production:
```
installed 0.40.0 -> status=up_to_date
   "You're running the latest Orbit (0.40.0)."
installed 0.42.1 -> status=ahead
   "...ahead of the published release (0.40.0). This usually means you're running a dev build."
```
Both reported symptoms, from shipped code, in one call. Not two bugs — one line of trust seen from either side.
```
$ curl -sI https://yourorbit.team/api/orbit/latest-version | head -1
HTTP/2 200
$ curl -s https://yourorbit.team/api/orbit/latest-version | jq -r .version
0.40.0
```
**200 and wrong.** The header comment (`:8-10`) claims it "fails gracefully" — naming *non-2xx*. The failure that happened is well-formed, cached, 200, wrong, and has no branch. `version-nag.js:25` consumes the same result, so a 0.40.0 user is told they are current and **is never nagged again**. The update funnel isn't degraded for people behind; it is switched off for exactly them.

Freshness check on the payload: `manifest_version, name, display_name, version, icon, description, long_description, author, homepage, privacy_policies, license, server, user_config, tools, keywords, compatibility` — **no timestamp of any kind**, and `grep "generated_at\|toISOString\|LastModified"` on the route returns nothing. A correct payload and a stale one are byte-indistinguishable.

## 2 — The registry is already correct, signed, and ignored `[instrumented]`

```
version: 0.42.1 | isLatest: true | sha: 8985307ede3e58e8 | published: 2026-09-10T03:43:27Z
```
I resolved its pinned artefact and hashed the bytes:
```
HTTP 200  bytes=37726516
actual sha256:   8985307ede3e58e8957f0ca3a0587b44337f2d758246ea30ff5e459d8c74c015
registry sha256: 8985307ede3e58e8957f0ca3a0587b44337f2d758246ea30ff5e459d8c74c015
```
End-to-end intact. GitHub Releases agrees independently — `tag: v0.42.1 | draft: false | prerelease: false`, unauthenticated, `x-ratelimit-limit: 60` (a per-session check costs ~1). What they add that the site cannot: **a content hash**. The registry pins bytes, not a number — the difference between "am I current" and "did I get what was published".

## 3 — The admin surface is closed, and closed by hand `[instrumented]`

Probed live, unauthenticated:
```
/api/admin/subscribers/csv  → 401 ("Unauthorized", 12 bytes)
/api/admin/feedback         → HTTP/2 405
/admin                      → HTTP/2 307 (→ /admin/login)
```
No leak. But `middleware.ts:106` is `if (!pathname.startsWith("/admin")) return ...next()` — **`/api/admin/*` does not match**. It holds only because each data route self-authenticates in-route (`resolveOperator`, `:40`/`:30`). The tripwire meant to enforce this reads **one hardcoded filename** (`pentest-remediations.test.mjs:55`); `grep readdir\|glob\|walk` returns nothing. It enumerates no routes. The 8th admin route ships open and no test fires — a spot-check wearing a gate's clothes.

## The sixth instance of the species

`version-check.js:7` — *"Single-source because the source repo is private and the -dl mirror has been retired."*
```
$ env -u GITHUB_TOKEN -u GH_TOKEN curl -s api.github.com/repos/justinwilliames/orbit-for-claude
private: false | visibility: public
```
**The premise is dead.** The design was justified by a constraint that no longer exists, and nothing noticed because the justification lives in a comment. The sharpest instance yet: the other five parked a *fact*; this parked a *reason* — and the reason expiring is what made the architecture wrong.

## The single thing I'd ship

**Three sources, highest-version wins, and never say "dev build" on one witness.** Registry (hash-bearing) + GitHub Releases (unauth) + the site (counts sidecar). `compareVersions` exists; this is a `Promise.allSettled` and a max. It turns today's two failures into zero: the 0.42.1 user is no longer insulted, the 0.40.0 user is finally told the truth. Ship it with a gate that fails when any reachable source disagrees with `manifest.json` — that is what makes it survive, and what would have caught this before a user did. ~2h, reversible, does not touch Railway.

## What I'd defer

A freshness field on the endpoint — correct, and second: once the client reads three sources, a stale one stops mattering. Also the admin-route enumeration gate to 0.43.0; it guards a hole nobody is in.

## CHALLENGE (to Justin)

"More powerful" reads as more surface. The update chain says the opposite: Orbit already *has* two better feeds than the one it uses. The most powerful change this week is **deleting a dependency**, not adding a tool. A product that cannot tell users what version they're on has no business shipping a 136th.

## Consult — Voyager, spoken via say.sh, verbatim

> "Voyager — telemetry carries a `version` field on every call (`telemetry.js:148`, `:164`, `:214`). I can prove the update prompt is dead for everyone below 0.42.1, but I cannot size it. From what production has actually received: how many distinct installs are sitting behind? Or is that denominator as absent as `page_engagement`'s?"

## Owed from 09-08, unpaid

Iris's block stands and it is mine. **Nobody has observed Claude Desktop.** Everything above is harness and curl. I did not pay it this round either — say so plainly in R2 rather than let it age into a fact.

— Sentinel
