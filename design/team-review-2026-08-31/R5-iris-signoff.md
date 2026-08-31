> Personas are fictional cognitive frames — see the pulsar-team SKILL.md §1 disclaimer. Nothing here is a statement by or about a real person.

# R5 — Iris (Marketing), sign-off · 31 Aug 2026

## 1. Disposition of my R1 findings — re-measured against the live repo

**1. [instrumented] README install identifier — STILL PRESENT.**
R1: registry said `braze-lifecycle-mcp` deprecated, `orbit-lifecycle-mcp` active; README told readers to install the deprecated one. Re-run just now:
```
curl .../servers?search=braze-lifecycle-mcp → "status":"deprecated" (unchanged, 06:15:31 timestamp)
curl .../servers?search=orbit-lifecycle-mcp → "status":"active" (unchanged)
grep -n "io.github.justinwilliames" README.md
  78: io.github.justinwilliames/braze-lifecycle-mcp
  83: warns off `orbit-for-claude` — the WRONG deprecated name, not the one actually live in the field above it
```
Nothing moved. Worse than I scoped it in R1: the warning on line 83 doesn't even name the identifier that's actually deprecated — it's aimed at a third, older name. The front door is still pointing at a dead registry entry, and the registry's own `orbit-lifecycle-mcp` record hasn't even been bumped past v0.31.1 despite v0.32.0 shipping today. Still present.

**2. [instrumented] Guide count undercounts by 8 — STILL PRESENT.**
```
node scripts/sync-counts.mjs
→ Inventory already in sync everywhere ("83 skills and 135 tools", "99 long-form practitioner guides")
grep -n "long-form\|199,000" README.md
  23: "91 long-form guides bundled inside the extension"
  59: "91 long-form guides ship inside the extension" / "199,000-word practitioner library"
```
`data/guides-export.json` count field: still 99. README still says 91. The guard still doesn't catch hand-written prose outside its exact regex shape. Still present.

**3. [judgement] No install-source telemetry to read renames against — STILL PRESENT, and R4 makes it worse, not better.**
R4 formally defers `installSource` behind items 1–5 closing ("nothing new lands on that pipe until items 1–5 close"). Correct call given item 1 is still open — but it means the measurement gap I flagged in R1 is now explicitly load-bearing for how long we stay blind, not just an oversight. Still present, now scheduled.

## 2. My R3 block — re-verified against the shipped artefact

**Block condition:** no promotion until PRIVACY.md ships inside the `.mcpb` and the friction event is disclosed. R4 item 5 claims this ships; item 1 claims the friction send is deleted. **Neither executed** — confirmed on disk, not on the plan:

```
ls -la orbit-lifecycle-marketing-system-for-claude.mcpb → mtime Aug 25 08:50, PREDATES this review
unzip -l orbit-lifecycle-marketing-system-for-claude.mcpb | grep -i privacy
  → 816  08-25-2026 08:50  docs/PRIVACY.md
```
This is worse than "not shipped." A file named `PRIVACY.md` *is* in the bundle — but I pulled it out and read it: it's a completely unrelated document about Google image-generation privacy, not the telemetry/friction disclosure. A shallow `unzip -l | grep privacy` check would show a false pass. The real, 5,790-byte root `PRIVACY.md` — the one that would need to cover `trackFriction` — isn't in the bundle at all, and doesn't mention "friction" even where it lives on disk (`grep -i friction PRIVACY.md` → no match). `manifest.json`'s `privacy_policies` field: absent, root and bundled copy alike.

Code side: `server/index.js:1590` still calls `trackFriction({ slug: "route_task_no_match", detail: request, ... })` — the raw request still travels. `server/telemetry.js:84` still tells the user's own console *"content is never sent verbatim"* while it does exactly that. Nothing from item 1 or item 5 landed.

**My block stands.**

**Falsifiable number, restated and re-checked.** R3: v0.32.0's downloadCount clears 42 by 2026-09-11. Current count, checked just now: **v0.32.0 = 4 downloads** (v0.31.1's total for comparison: 42). Release shipped six hours ago — too early to call, judged date is eleven days out. I'm not moving the goalposts; flagging that the test is mid-flight, not resolved.

## 3. Verdict

**I BLOCK on: R4 items 1 and 5 (privacy/friction disclosure)** — same block as R3, unchanged, because the shipped `.mcpb` still carries a false privacy claim and a mislabeled decoy file where the real disclosure should be.

## 4. What I learned across five rounds

The sharpest trust failure in this review was never the one I filed first — it's the gap between "the plan says it ships" and "the artefact says it shipped," and only `unzip -l` plus actually reading the file inside it closes that gap.

— Iris
