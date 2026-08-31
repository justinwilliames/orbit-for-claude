> Personas are fictional cognitive frames — see the pulsar-team SKILL.md §1 disclaimer. Nothing here is a statement by or about a real person.

# R1 — Sentinel (Principal Engineer + Data Analyst)
**Target:** orbit-for-claude, whole product, pre-ship gate · 31 Aug 2026

## 1. Verdict

**Ship it — v0.32.0 is already live and the chain verifies — but the release cannot be reproduced from its own tag, and until that is fixed I can tell you what users got, not why.**

## 2. Top three findings

### Finding 1 — The release is not reproducible from its tag. Proven, not suspected.
`[instrumented]`

I verified the update chain first, and the good news is real. The registry entry for `io.github.justinwilliames/orbit-lifecycle-mcp` at 0.32.0 carries `fileSha256 15b044a521704437…`, and the bytes GitHub actually serves hash to the same thing:

```
$ curl -sSL -o o.mcpb https://github.com/.../v0.32.0/orbit-lifecycle-marketing-system-for-claude.mcpb
HTTP:200 size:37678522
GH RELEASE SHA256: 15b044a521704437e4637c17af6e35326816515e3cb744cc61fbca215b6b905a
REGISTRY SHA256  : 15b044a521704437e4637c17af6e35326816515e3cb744cc61fbca215b6b905a
```

Chain intact. Now the part that isn't. Tag `v0.32.0` resolves to `0514999` — the same commit as HEAD. I pulled one shipped file out of the artefact and compared it to that commit:

```
SHIPPED (inside o.mcpb) : da7ffe4e7a5a5c60d163d3b6aa34dbbec24ac1222c3824cc23b02842a68da2ae
HEAD/tag v0.32.0        : 0436a73afed54b6f797860c0d31f9b918dede2a5f78a9c58498dcb2f5962a86d
```

`data/guides-export.json` — 1.35 MB of the 37 MB bundle — **is not the file in the commit it was built from.** Root cause is `scripts/build-extension.js:59`, which shells out to `fetch-guides.mjs` mid-build; that script network-fetches `get.yourorbit.team` and overwrites the tracked file into the bundle. Rebuild `v0.32.0` tomorrow and you get a different sha256 against a registry entry that is frozen forever.

Worse, the failure path is soft. `fetch-guides.mjs` catches, checks for an existing snapshot, and `console.warn`s "keeping existing snapshot" — green build, stale content, one line in a 20,000-line log. That is the same swallow-shape the workflow's own comments say has bitten this pipeline three times. It was fixed for the dispatch token and left standing here.

The pipeline step that would have caught this is **absent**. Nothing compares the packed artefact against the tree it was packed from.

### Finding 2 — The public download page undercounts the product, and the count gate is structurally blind to it.
`[instrumented]`

The count-drift test that reddened CI on 24 Aug does its job — `58-key-optional-routing.test.mjs:131` reads `readdirSync(skills/)` for a genuinely independent denominator, and `sync-counts.mjs` reports clean:

```
$ node scripts/sync-counts.mjs
Inventory already in sync everywhere ("83 skills and 135 tools", "99 long-form practitioner guides").
```

But `sync-counts.mjs` writes exactly four targets: `README.md`, `manifest.json`, `server.json`, `server/index.js`. The surface a stranger actually reads is none of them:

```
$ curl -sS https://yourorbit.team/downloads | grep -oE '[0-9]+ lifecycle skills and [0-9]+ tools'
79 lifecycle skills and 130 tools
```

Live site: 79/130. Shipped: 83/135. And the Orbit MCP loaded into *this very session* advertises a third number, 81/135. Three surfaces, three answers, one of them the sales page. The propagation path is the `repository_dispatch` at `build-mcpb.yml:525` — whose own comment states `ORBIT_WEBSITE_DISPATCH_TOKEN` "IS NOT SET, AND HAS NEVER BEEN SET", leaving a daily cron as the only sync. Eleven days after 0.31.1 the site is still four skills behind, so the cron is not closing it either. Restating the metric: the number is real, the *denominator on the page* is a stale copy nobody gates.

### Finding 3 — Suite 36's timeout cliff was moved, not removed, and its failure shape is silent.
`[instrumented]`

The parallelisation worked. Locally, `36-standalone-signature.test.mjs` now runs 50 assertions in 21.4s; the full suite is 1175/1175 green in 236s:

```
ℹ tests 1175   ℹ pass 1175   ℹ fail 0   ℹ duration_ms 235891.18
```

On CI hardware it is a different picture. From run `33362799044`, the signature suite's log window runs `06:06:56.46 → 06:07:42.40` — **~46 seconds against the `timeout: 60_000` at `tests/run.mjs:64`.** Individual subtests report 17.2s each where local ones cost under 1s. That is 77% of budget consumed and roughly 14 seconds of headroom for 92 assertions across 46 UI resources. Add two more resources and it breaches again — and when it does, node:test kills the *file* and discards its buffered subtests, so 50 passing assertions resurface as one nameless timeout plus an "EMPTY SUITE" warning. The regression is not the slowness; it is that the slowness fails illegibly.

Credit where due: `40-release-guard.test.mjs` is the best suite in this repo — 9 tests, 7 of them failure modes (unresolvable host, 5xx, unreadable 200, 404-first-publish, published-on-dispatch, published-on-push), and it asserts the literal `SHIPPED NOTHING` string. That is how a gate should be written.

## 3. The single thing I'd ship

**Make the artefact reproducible from its tag, and fail the build when it isn't.**

Move `fetch-guides.mjs` out of `build-extension.js` into its own scheduled job that commits the refreshed export. Then add one step to `build-mcpb.yml`, immediately after packaging: regenerate, and `git diff --exit-code` — if the working tree is dirty after a build, the tag does not describe the artefact and the release stops.

Three silent degradations collapse into one loud one, and for the first time the registry's frozen checksum becomes something a stranger can independently reproduce. Twenty lines.

## 4. What I'd defer

- **Whether 83/135 is the right thing to advertise at all.** I can prove the number is wrong on the page; whether a skill count is the metric that should be leading the download page is Iris's and Echo's call, not mine.
- **The free-account gate on the website download versus the ungated GitHub release.** Two install paths with different friction is a product decision. Atlas owns it.
- **`docs/braze-api-key-permissions.md` is shipped inside the .mcpb and correctly linked from `SETUP.md:88` and `braze-canvas-conformance.md:34` — that fix is real.** But its own stated invariant ("Skills and server modules that name a permission inline should agree with it") has zero tests; `grep -rn "braze-api-key-permissions" tests/` returns nothing. The rot mechanism moved from *overwritten* to *drifts silently*. Whether that earns a gate now is a prioritisation call above my pay grade — flagging, not blocking.

## 5. Question for another drone

**CONSULT Voyager: the build fetches `guides-export.json` from the live site into the bundle, so the shipped .mcpb and its own tag differ by a checksum — can that export be a committed, pinned input rather than a build-time fetch, without breaking the daily site sync you own?**

He builds the instrument; I only read it. If pinning breaks his pipeline I need to know before I make it a release gate.

---

*Will this still be debuggable in six months? The registry says yes. The tag says ask again after a rebuild.*

**— Sentinel**, Principal Engineer + Data Analyst
