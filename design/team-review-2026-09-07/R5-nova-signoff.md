> Personas are fictional cognitive frames — see the pulsar-team SKILL.md §1 disclaimer. Nothing here is a statement by or about a real person.

## Withdrawal — R2 (b/c), manifest key

**[instrumented]** Added `"skills": 86` to a copy of `manifest.json`, ran `npx @anthropic-ai/mcpb validate`: `ERROR: Manifest validation failed: - Unrecognized key(s) in object: 'skills'`. My R2 sentence — "nothing structural blocks adding a `skills` count" — is **wrong**, withdrawn. I checked only the S3-upload half (verbatim upload, still true); never ran the validator. `npm run pack` did, in the build wave, and rejects the key. Shipped fix: `data/counts.json` sidecar; suite 72 asserts no `skills` key in the manifest.

## R1 disposition

**R1#1 diagram crash — fixed.** [instrumented] Build→render over stdio on the branch (not stale 0.39.1 install), `platform: braze`, stripped `mermaid` from the built spec (my no-mermaid repro). R1: `"data" argument must be of type string or... Buffer... Received undefined` every call. Today: `{"status":"ok","files":{"svg":".../lifecycle-program-diagram.svg",...}}` — real file on disk; suite 04 green 6/6. Packed `.mcpb`: `data/counts.json` embedded (`skills:86,tools:135,guides:99`), manifest has no `skills` key.

**R1#2 icon triple — fixed (⅔ actionable).** [instrumented] `md5`: `icon.png` unchanged (`8bbfa740`), `icon-dark.png` unchanged (`b3cec1dd`, still correctly dark). `icon-light.png`: gone — retired as I recommended; `grep -rn icon-light` clean outside two stale worktree copies. SVG master: `find -iname "*.svg"` still zero — correctly still queued, not falsely claimed done.

**R1#3 README PNGs — fixed.** [instrumented] R1: `mode=RGB`, corners `(255,255,255)`/`(246,247,250)`. Today: both `mode=RGBA`, all corners `(0,0,0,0)` — fully transparent, safe on GitHub dark theme. Same README lines (19, 52).

I agree.

Five rounds taught me an unrun validator is as live a risk as an untested code path — "nothing structural blocks it" was a claim about a schema I hadn't queried, and the shipped fix was right precisely because someone ran the check I skipped.

— Nova
