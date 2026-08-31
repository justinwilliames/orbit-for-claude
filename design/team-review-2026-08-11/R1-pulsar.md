# R1 — Pulsar (Chief of Staff / orchestration lens)

> Personas are fictional cognitive frames — see pulsar-team SKILL.md §1. Nothing here is a statement by or about a real person.

Reviewed: `orbit-for-claude` @ `6bbb2aa` and `get-orbit` @ `c541493`, both on
`free-orbit-remove-monetisation`. Prior audits read in full; nothing below
re-discovers them.

---

## What I'm not going to re-litigate

The removal itself is clean, and one thing in it deserves saying out loud because
it's the kind of thing that usually goes wrong: **the sequencing trap Voyager
flagged was actually respected.** `app/api/orbit/validate-license/route.ts` was
not deleted — it was reduced to an unconditional `{ valid: true, tier: "free" }`
so no already-installed copy can fail closed. `/api/mcpb-download` dropped its
entitlement check rather than its tracking. The cross-repo `repository_dispatch`
chain is wired at both ends (`build-mcpb.yml` fires `mcpb-released`,
`sync-mcpb-version.yml` listens) with a daily cron behind it because the last
version of that chain died silently when a PAT expired. Tests now gate the
release and they pass: **427 tests / 499 assertions, 0 fail**. That is a
competent teardown.

So my findings are not about the teardown. They're about the fact that the
teardown finished and **the distribution was never re-sequenced behind it.**

---

## The one-sentence diagnosis

Orbit removed the wall from the *product* and left it standing in the *funnel* —
and the one channel built for strangers to find it is still serving them the
July build that asks for a purchased key.

That is a complete, sufficient explanation for 0 stars and 75 downloads. It is
not a marketing problem. It is four wiring problems, and three of them are under
an hour each.

---

## 1. The registry is serving the paid build (blocker)

Orbit *is* in the official MCP registry. It has been since 9 July 2026. The
latest entry there is **v0.27.7** — which is, by its own commit message,
`972930b v0.27.7: paid repositioning of the activation surface — gate copy,
manifest key field, pricing URLs; test asserts the free-ban`.

Every stranger who discovers Orbit through the one directory built for
discovering MCP servers today downloads a bundle that hard-stops on
`needs_activation` the moment they point it at Braze, and sends them to a
pricing page that no longer exists. There is no worse first run available.

Nothing republishes it. `server.json` sits in the repo at version 0.27.7 while
`manifest.json` and `package.json` are at 0.27.8, and **no CI step, test, or
build script reads `server.json` at all** — I grepped `scripts/`, `tests/`, and
`.github/` and got zero hits. The new manifest-drift guard is good work, but it
guards manifest↔code; the *third* version file has no guard and will drift again
by construction on the next release.

## 2. The registry cannot find Orbit by any word that describes it

This is the finding I'd want on the wall.

Registry search matches the **server name**, not the description. Measured:

| query | results | Orbit present |
|---|---|---|
| `braze` | **0 servers** | no |
| `lifecycle` | 2 | no |
| `marketing` | 29 | no |
| `email` | 30 | no |

Orbit's description literally reads "Lifecycle-marketing OS for Claude … Braze,
Stripo, email, segmentation" and it does not surface for a single one of those
words. Its registry name is `io.github.justinwilliames/orbit-for-claude` — three
tokens, of which the searchable ones are the founder's GitHub handle and a word
that mostly returns a Zürich workshop-booking server.

Orbit is very probably the **only** Braze MCP in existence — `braze` returns zero
servers — and it is invisible to the search that would prove it.

The registry supports DNS-verified namespaces. `yourorbit.team` is already owned.
Publishing as something like `team.yourorbit/email-marketing-braze` puts the
three highest-intent words *inside the search key*. This decision must be made
**before** the next publish, not after — a registry name is a stable identifier,
and changing it later splits the version history and abandons whatever install
base the old name accrued.

## 3. The signup wall is still the only door

`/api/mcpb-download` now says, in its own header comment, "Orbit MCP is free for
everyone — no account, no sign-in, no entitlement check." Good. And then:

- `app/downloads/page.tsx` carries the comment **"GATING: the CTA routes through
  the sign-up gate — never a direct .mcpb link"** and its only button is `/sign-up`.
- Homepage hero, `/skills`, `/apps`, `McpCtaBanner`, `orbit-cta`, `not-found`,
  `state-of-crm-copy` — every CTA on the site resolves to `/sign-up`. The
  anonymous CTA state in `lib/resolve-cta-state.ts` is hardcoded
  `label: "Sign up free", href: "/sign-up"`.
- The only surface that links the ungated endpoint is `/account/downloads` —
  i.e. after you've already given up an email.
- Meanwhile the GitHub Release **is** public and ungated. I fetched
  `releases/download/v0.27.7/...mcpb` and got a clean `302` to the asset. No
  marketing page links to it.

So there are two doors. The frictionless one is unadvertised; the advertised one
costs an email address. For a product with two unique repo visitors in fourteen
days, an email wall in front of a free download isn't conversion optimisation —
it's the reason the denominator is two.

This one is a *decision*, not a defect. The code comment proves the gate is
deliberate. Somebody has to own the trade: attributable signups versus a stranger
who can try the thing in ninety seconds. My recommendation is the ninety seconds,
with the email capture moved *after* first value — but the point of this finding
is that it needs a name against it, not that I'm right.

## 4. "Free, open" with no licence

`README.md:3` — "A free, open lifecycle-marketing operating system for Claude
Desktop." The GitHub API returns `"license": null`. There is no `LICENSE` file
tracked. `package.json` has no `license` field and `"private": true`.

Legally that is all-rights-reserved. Any marketer at any company of size who
likes Orbit enough to ask their legal or security team hits a repo with no
licence, no `SECURITY.md`, no `CONTRIBUTING.md`, and bounces — and that person is
exactly the stranger this relaunch is trying to earn. It's a five-minute fix and
it gates the registry republish, because the registry entry is what sends people
to the repo to evaluate it.

## 5. The pitch a stranger reads is two releases out of date

The site solved its own drift problem properly — `lib/counts.ts` derives every
visible count from a source of truth, and `MCP_TOOL_COUNT` syncs off the live S3
manifest within fifteen minutes. Excellent.

The three surfaces a *GitHub or registry* visitor actually sees are hand-written
and stale:

| surface | claims | actual |
|---|---|---|
| `README.md:5,42` | "60+ protocols and 80+ tools" | 77 skills, **121 tools** |
| `server.json` description | "60+ skills and 80+ tools" | same |
| GitHub repo description | "60+ battle-tested skills and 80+ tools" | same |

Understating your own product by forty tools is a strange way to fight for
attention.

And the sharper version of the same problem: **the README does not mention the
widgets at all.** Zero hits for `widget`, `MCP App`, `interactive`, `gallery`,
`render gate`, or `ui://` across all 67 lines. Roughly 3,000 lines of the most
demonstrable, screenshottable, genuinely-novel work in this entire release — a
render-backed gate, a creative review gallery a colleague can open without an MCP
server at all — is invisible on the front door. That is the asset that would earn
a stranger's attention, and it is currently only discoverable by reading
`server/ui/`.

(Credit where due: `server/ui/register.js` hedges the host-capability risk
properly — every widget ships as both a `ui://` resource *and* a data-baked
artifact, because "the shell treats the host bridge as optional rather than
required." Shipping against an extension whose host rollout is unconfirmed is
usually a bet; here it degrades. No finding.)

---

## Sequencing — what I'd actually hold the line on

The instinct after a teardown this clean is to republish immediately. Don't. Four
of these items feed the fifth:

1. **LICENSE file** (5 min) — gates everything, because it's what an evaluator
   checks after the registry sends them to the repo.
2. **Decide the registry name** — `io.github.justinwilliames/orbit-for-claude` vs
   a DNS-verified `team.yourorbit/…` with searchable terms. Cheap now, expensive
   after the next publish.
3. **Fix the three stale descriptions + add widgets to the README** (30 min) —
   because the registry copies the description at publish time.
4. **Then publish 0.27.8 to the registry once**, and add the publish step to
   `build-mcpb.yml` plus a `server.json` version assertion to the drift test, so
   this is the last time anyone finds out by hand.
5. **Separately and immediately: the signup-wall call.** It doesn't block the
   registry work and it's the largest single lever on the number this review
   exists to move.

Every item above has exactly one available owner. That's fine — what it doesn't
have yet is an order, and publishing before steps 1–3 wastes the one clean shot
at a first impression.
