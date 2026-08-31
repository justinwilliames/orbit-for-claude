Personas are fictional cognitive frames — see the pulsar-team SKILL.md §1 disclaimer. Nothing here is a statement by or about a real person.

# R2 — Meridian, consult: Q2 (routed by Voyager)

**Status:** consult only. Not summoned, no block rights this run, no R1.

## Ruling on Q2 — ships without re-consent

**No.** A five-value closed-vocabulary `verdict` on the ok-path, carrying no arguments and no
content, is inside the disclosure already made — provided you update `PRIVACY.md` and `README.md`
in the same commit that ships it. It does not require re-consenting existing installs.

The reasoning is that the disclosure is drawn at the level of *kind*, not *schema*. PRIVACY.md's
promises are negative and categorical: "Your prompts, Claude's replies, or any part of the
conversation" and "Tool arguments. No email HTML, no subject lines, no segment definitions, no
brand assets, no file contents, no file paths." A `verdict` of `pass|warn|fail|unknown|not-measured`
is none of those. It is structurally identical to `errorClass`, which the same page already
discloses as "a closed, identifier-shaped set" and which the reader has already consented to
receive. Nothing new about the user becomes knowable. The consent that covers `auth_failed` covers
`warn` — same event stream, same opaque `clientId`, same opt-out, same closed vocabulary.

Two conditions, both cheap. First, PRIVACY.md line 20 says "Every event carries exactly these
fields and no others" — that is an affirmative representation, and shipping a sixth field while it
stands makes the page false. Fix the sentence, don't rely on the caveat at the bottom. Second,
`tests/suites/30-telemetry.test.mjs:79-84` pins the `tool_error` key set exactly; extend the same
guard to `tool_call` so the field set stays enumerable rather than merely documented. `not-measured`
survives the receiving end's regex (`/^[A-Za-z][A-Za-z0-9_-]{0,80}$/`, per the note in
`server/status-vocabulary.js`), so no schema break there. Eighteen days is long enough. Ship it.

## The question nobody routed to me

Two things in there are worse than the one I was asked about.

**[instrumented] The telemetry disclosure never reaches the shipped bundle.** I listed the
archive: `unzip -l orbit-lifecycle-marketing-system-for-claude.mcpb | grep PRIVACY` returns exactly
one hit — `docs/PRIVACY.md`, 816 bytes. That is the *image-generation* page. The root `PRIVACY.md`,
5,790 bytes, the one that actually discloses the telemetry POST, the `clientId`, the update check
and the opt-out, is **not in the bundle at all**. Root-level entries are `THIRD-PARTY-NOTICES.md`,
three icons, `manifest.json`, `orbit.md`, `orbit-lifecycle-os-claude.md`. And the manifest's
`privacy_policies` field is **null** — I parsed it out of the shipped `manifest.json` directly. So
an installer's entire in-product disclosure is one `user_config` description string. Everything else
lives in a GitHub repo they were never required to visit. This is my own scar verbatim: the notice
exists, it is well written, and it does not travel with the product.

**[instrumented] There is a fifth event type, and it posts the user's own request text.**
`server/index.js:1590`:

```js
trackFriction({ slug: "route_task_no_match", detail: request, version: ORBIT_VERSION })
```

`request` is what the user typed to `orbit_route_task`. `server/telemetry.js:257` redacts it through
`redactSensitive` — emails, URLs, paths, key shapes, digit runs, capped at 300 chars — which is
genuine and I credit it. But redaction strips *identifiers*, not *content*: "why did our Black
Friday win-back to lapsed enterprise accounts underperform" passes every rule in `redact.js`
untouched. Meanwhile PRIVACY.md lists four event types and never uses the word `friction`; README.md
line 93 says "Four event types"; and `manifest.json:84` — the only disclosure that ships — says
"**Never sends prompts, queries, tool arguments**". The code sends a query. The page the user reads
in the product says it doesn't.

That is a materially inaccurate disclosure, not a documentation lag, and it is a strictly bigger
exposure than the one Voyager asked me about. `verdict` adds a field the disclosure implies;
`friction.detail` sends a category the disclosure denies.

## What I'd do

1. Ship `verdict`. Amend PRIVACY.md and README.md in the same commit.
2. Same commit, fix `friction`: disclose the event type and `detail`, and correct
   `manifest.json:84` — it is the only text a stranger sees.
3. Put root `PRIVACY.md` in the bundle and set `manifest.json.privacy_policies`. One line each.

`CONSULT Sentinel:` add a bundle-contents assertion — a test that fails when a named disclosure file
is absent from the built `.mcpb`. Documentation drift is caught; bundle drift currently is not.
