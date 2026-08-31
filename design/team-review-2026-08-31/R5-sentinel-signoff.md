> Personas are fictional cognitive frames — see the pulsar-team SKILL.md §1 disclaimer. Nothing here is a statement by or about a real person.

# R5 — Sentinel, sign-off · 31 Aug 2026

Re-run against the unchanged tree at `0514999`. Every instrument fired again. Nothing moved.

## 1. Disposition of my R1 findings

**Finding 1 — release not reproducible from its tag. STILL PRESENT.**
`build-extension.js:59` still `execSync`s `fetch-guides.mjs` mid-build. `grep -n "git diff --exit-code" .github/workflows/*.yml` → **NO DIFF GATE**. The tree is still dirty on the same file, and the diff is still exactly the byte I conceded to Voyager:
```
-  "exportedAt": "2026-08-21T11:59:17.368Z",
+  "exportedAt": "2026-08-24T15:56:30.370Z",
```
Correctly ranked below privacy in R4's queue. Correctly still open.

**Finding 2 — the download page undercounts. STILL PRESENT, digit-identical.**
```
R1: 79 lifecycle skills and 130 tools   R5: 79 lifecycle skills and 130 tools
shipped: 83 skills and 135 tools · readdirSync(skills/) = 83 · sync-counts: "already in sync"
```
Four surfaces gated, the sales page still not one of them.

**Finding 3 — suite 36's timeout cliff. STILL PRESENT, marginally worse.**
`tests/run.mjs:64` still `timeout: 60_000`. Local: R1 21.4s → **R5 23.5s**, 50/50 pass. One subtest alone now costs 22.0s. CI ran ~46s against 60s; nothing has bought headroom back.

## 2. My R3 line in the sand — it holds

Re-pointed the collector at a local socket. Byte-identical to R3, twelve hours later:
```
[orbit] ... (content is never sent verbatim; ...)
WIRE BODY >>> {"type":"friction","slug":"route_task_no_match",
  "clientId":"3b0c8e3d8a3be7f8443b0fe5254c9d13","version":"0.32.0",
  "detail":"why did our Black Friday win-back to lapsed enterprise accounts underperform"}
```
`server/index.js:1590` intact. `manifest.json:84` intact. `grep -n privacy_policies manifest.json` → nothing; item 5 unshipped too.

And the guard that exists is aimed at the wrong invariant: `51-feedback-loop.test.mjs:70` asserts `trackFriction` *redacts* `detail` — it passes green while the prose walks out whole. That is my own scar with a different logo on it.

## 3. Prior-cycle item 5

**STILL PRESENT, unchanged output.** `selectors_found:0, selectors_checked:27, selectors_resolved:27, selectors_errored:0`, graded `warn`, on a domain whose apex returned `ENOTFOUND` in the same call. R4 puts it back on the board rather than in the seven. I accept that ranking.

## 4. Verdict

**I agree with caveat: nothing ships to the registry until R4 items 1 and 2 are both merged.** My R3 line was against the *release*, not the plan — and the plan ranks my finding first, so blocking it would be blocking someone for agreeing with me. The caveat is not a preference: item 1 unshipped means the wire body above is what every installer gets.

## 5. What five rounds taught me

I can prove a checksum nobody will ever recompute in ninety seconds, and it took the team four rounds to make me point the same instrument at the one packet with a person on the other end.

---

*The paperwork is unchanged. So is the packet.*

**— Sentinel**, Principal Engineer + Data Analyst
