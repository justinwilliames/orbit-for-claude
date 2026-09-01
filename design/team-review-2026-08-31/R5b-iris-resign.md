> Personas are fictional cognitive frames — see the pulsar-team SKILL.md §1 disclaimer. Nothing here is a statement by or about a real person.

# R5b — Iris (Marketing), re-sign-off · 1 Sep 2026

## 1. My R5 condition, and whether it is met

R5: *"I BLOCK on: R4 items 1 and 5 (privacy/friction disclosure) — same block as R3, unchanged, because the shipped `.mcpb` still carries a false privacy claim and a mislabeled decoy file where the real disclosure should be."*

I did not re-read the orchestrator's numbers against the plan text — I pulled the **actual GitHub release asset** with `gh release download v0.33.0` and inspected it directly, the same discipline that caught the decoy file at R5.

```
gh release download v0.33.0 → orbit-lifecycle-marketing-system-for-claude.mcpb (published 2026-08-31T07:51:52Z, downloadCount 9)
unzip -l → PRIVACY.md  6412 bytes  08-31-2026 17:51   (root — not the docs/ decoy)
unzip -p manifest.json | privacy_policies → ['https://yourorbit.team/privacy', '.../PRIVACY.md']
unzip -p PRIVACY.md | grep -i friction → "`friction` | when one tool fails three times consecutively..."
                                          "`friction` was undocumented here until 0.33.0..."
unzip -p server/index.js | grep -c "trackFriction|route_task_no_match" → 0
node --check on the extracted entry point → OK
registry lookup, all versions → 0.33.0: status=active, isLatest=True
```

Root `PRIVACY.md` is real, in the right place, and names the exact gap I filed at R3/R5. `trackFriction` is gone from the shipped code, not just the plan. `telemetry.js:84`'s "content is never sent verbatim" is now true — there's nothing left in the route-task path that sends verbatim content. **Condition met**, checked against the artefact a stranger would actually download, not the plan or the local build.

## 2. Verdict

**I agree.**

One overstatement to flag, outside my block but inside my brief: I was told `"content-emptiness"` has 0 occurrences. It doesn't — it's still live in the shipped `manifest.json` description for `orbit_score_subject_line`. That's Nebula's queued item (deferred to the week, correctly, not one of the seven), so it doesn't reopen my block — but the number I was handed was wrong, not just early, and I'm not passing it through uncorrected.

**Falsifiable number, restated.** R3 called v0.32.0 clearing 42 downloads by 2026-09-11. Today, 2026-09-01, ten days early: v0.32.0 sits at **8** downloads (v0.31.1's total, for scale: 42). v0.33.0, now also live and measurable, sits at **9**. Neither number is close to 42 with ten days left — trending well short unless install velocity changes sharply. Judgement withheld until the date; recorded so nobody has to re-derive it.

## 3. What shipping changed

Nothing changed about what I'd have wanted — the plan matched the artefact this time, which is the only thing my block was ever asking for.

— Iris
