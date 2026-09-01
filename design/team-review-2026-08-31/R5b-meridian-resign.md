> Personas are fictional cognitive frames — see the pulsar-team SKILL.md §1 disclaimer. Nothing here is a statement by or about a real person.

# R5b — Meridian, re-sign · 01 Sep 2026

## 1. My R5 condition

> *"I agree with caveat: no release tag is cut while `server/index.js:1590` stands."*

**Met.** A tag was cut — `v0.33.0` at `3b7b3ef`, on the remote. Line 1590 did not
survive it. Measured against the downloaded asset (sha256 `aa0fe063…`), not the repo:

| Check | Shipped bundle |
|---|---|
| `route_task_no_match` in `server/index.js` | **0** |
| `trackFriction` identifier | **0** |
| Root `PRIVACY.md` | **present, 6,412 B** |
| `manifest.privacy_policies` | 2 URLs |

The function survives minified as `bze` and still carries a `detail` branch —
but it has exactly **one** call site, passing `{slug, errorClass, version}`.
No caller supplies `detail`; nothing content-bearing reaches the wire. Guard 1
holds the line, though it exempts `telemetry.js`, so a future caller *inside*
that file would evade it. Narrow, worth a line in #24.

## 2. The residual — signable

The historical rows are a **standing exposure**, and a signable one. Collection
stopped at three layers: the client stopped sending (0.33.0), the server stopped
storing (`route.ts:68` — `detail = undefined`, live, `server: railway-hikari`),
and `eraseStoredFrictionDetail()` NULLs the column, idempotent, deliberately
unwired. What would make it unsignable is a notice claiming the rows were gone.
I read `PRIVACY.md`; it makes no such claim. A written remedy awaiting the only
person with authority to run it is a correct refusal, not an evasion.

*Disclosure: my liveness probe POSTed a `detail` string to production and got 200.
If the discard failed, I added one row. The erase covers it.*

## 3. What I found instead

`PRIVACY.md:69` — **"Your IP address. The receiving server does not log it."**

The application does not: no IP is read from headers, and the insert at
`db.ts:894` has no such column. But the receiving server is Railway's edge
(`x-railway-edge: sjc1`), whose proxy records client IP as a matter of course
and which nobody here controls. "*The application* does not log it" is provable.
"*The receiving server* does not" is an absolute claim about infrastructure this
project cannot make good on — the same defect class this whole cycle existed to
kill, at a fraction of the magnitude. It is one sentence to correct, not a block.

## 4. Verdict

**I agree with caveat: `PRIVACY.md:69` is narrowed to the application layer, and
the manifest's "or your IP address" reads as payload contents.**

Shipping changed my position from provisional to settled: my caveat bound to the
artefact rather than to anyone's intent, and the artefact came back clean, so the
signature stands — and the one overclaim left is mine to have found, not to have
blocked.

— Meridian, General Counsel
