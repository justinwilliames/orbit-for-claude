# R4 — Nebula (Creative Director: brand + narrative)

> Personas are fictional cognitive frames — see pulsar-team SKILL.md §1. Nothing here is a statement by or about a real person.

Cycle 4. Three rounds have been spent on what Orbit *says* — the README, the
hero, the tagline, the counts. The team has that surface well in hand and I
didn't re-audit it. This round I went after what Orbit *looks like* when it
travels: the image that renders when somebody pastes the link, the typeface on
the artifact that leaves the building, the mark stamped on an export a
stakeholder opens in Notion.

Read this round: `server/orbit-branding.js`, `server/ui/tokens.js`,
`server/ui/shell.js`, `server/ui/widgets/*`, `server/lifecycle-diagrams.js`,
`server/notion-export.js`, `server/braze-pack.js`, `starter-brand-kit/*`,
`icon*.png`, `get-orbit/app/layout.tsx`, `get-orbit/app/globals.css`,
`get-orbit/app/api/og/route.tsx`, `get-orbit/public/images/*`, plus the live
GitHub repo metadata and the live homepage `<head>`.

---

## The diagnosis in one paragraph

Orbit's copy is now coherent. Its *identity* is not. There are three
typographic systems, two logo polarities, and one auto-generated share card
doing the work of a brand — and the reason is that Orbit, a product that ships
four tools for building brand kits and a `starter-brand-kit/` folder telling
strangers a kit needs "one official logo, at least two example assets, a
`brand-profile.json` and a `brand-guidelines.md`", has never made one for
itself. Every field that has drifted — `primary_logo`, `alternate_logo`,
`fonts`, `colors` — is a field in Orbit's own schema. The cobbler's children.

---

## 1. The image that renders every time anyone shares Orbit is GitHub's default — and it prints the zero

This is the highest-leverage brand asset in the estate and nobody owns it. When
a link to the repo lands in Slack, LinkedIn, X, Discord, Reddit, or iMessage,
this is what unfurls:

```
$ curl -s -o /tmp/gh-og.png -w "%{http_code} %{size_download}\n" \
    https://opengraph.githubassets.com/1/justinwilliames/orbit-for-claude
200 99216
```

I opened it. It is GitHub's fallback card: repo name in Helvetica-ish grey, a
personal photograph where a product mark should be, the stale About line, and
then — rendered in large type as a first-class element of the composition —

> **2** Contributors · **1** Issue · **0** Stars · **0** Forks

No Orbit mark. No indigo. No "free". A stranger's first *visual* impression of
Orbit is a scoreboard reading zero, next to a face they don't know, describing
a product that no longer exists. GitHub only draws that card when no social
preview has been uploaded (Settings → General → Social preview), and none has.

The cruelty of it is that Orbit already generates a beautiful one:

```
$ curl -s -o /tmp/orbit-og.png -w "og route: %{http_code} %{size_download} %{content_type}\n" \
    "https://yourorbit.team/api/og?title=Orbit&subtitle=A%20lifecycle%20marketer%2C%20built%20into%20Claude.&category=Free%20%C2%B7%20no%20account"
og route: 200 92762 bytes image/png
```

1200×630, near-black ground, the planet mark glowing on the right, `FREE · NO
ACCOUNT` in letterspaced indigo caps, the sentence the whole team agreed on, and
`yourorbit.team →` at the foot. Thirty-eight pages on the site ship one of
these. The product's actual home ships none.

The fix is a screenshot and an upload. Hit that URL, save the PNG, drop it in
repo settings. Ten minutes, and every link Orbit has ever had pasted anywhere
stops advertising a zero. Do it *before* any push campaign, not after — X and
LinkedIn cache the card per-URL and the first share sets it.

(While in there: the About description is still `60+ … 80+ … Claude Desktop`
and never says free. That one is already filed by Pulsar and Iris — I'm not
re-filing it, but it renders *inside this same card*, so fix them in one sitting.)

---

## 2. Orbit has three typefaces and no typeface

Not a drift of one surface. A clean three-way split, and no two of them overlap:

| Surface | Display | Text | Mono |
|---|---|---|---|
| yourorbit.team (`app/layout.tsx:2`) | Bricolage Grotesque | Inter | JetBrains Mono |
| MCP App widgets (`server/ui/tokens.js:57-59`) | *declares* Bricolage — **falls back to system UI** | Inter → system | JetBrains → system |
| Exported artifacts (`server/orbit-branding.js:35-58`) | **Oxanium** | **Sora** | **Geist Mono** |

```
$ grep -n "Bricolage\|Sora\|Oxanium\|Geist\|JetBrains\|Inter" get-orbit/app/layout.tsx | head -1
2:import { Inter, JetBrains_Mono, Bricolage_Grotesque } from "next/font/google";

$ find assets -name "*.ttf"
assets/fonts/GeistMono/GeistMono-Regular.ttf
assets/fonts/Sora/Sora-Variable.ttf
assets/fonts/Oxanium/Oxanium-Variable.ttf
```

The extension carries three real variable TTFs — and not one of them is a face
the website uses. `tokens.js` is honest about the widget half in its own header
comment: *"The widget CSP is deny-by-default and blocks font CDNs, so the site's
webfonts … cannot be fetched"*, so it names them and lets the platform stack
win. Fine as an engineering call. But stack it against `orbit-branding.js` and
the outcome is that Orbit renders in the system font where the user is looking,
in Oxanium on the thing they hand to their boss, and in Bricolage on the site
that thing links back to.

The exported artifact is the worst place to lose it. `lifecycle-diagrams.js:1062`
stamps `renderOrbitSvgBrandBadge` — "Built in Orbit" in Oxanium, over the
tagline in Sora — onto an SVG/PDF whose entire purpose is to be forwarded to
somebody who then clicks through to a site set in Bricolage. That is two
different companies to anyone who notices, and one vaguely-off feeling to
everyone who doesn't. Brand recognition is repetition; there is nothing here to
repeat.

Pick one pair. My call: **Bricolage Grotesque + Inter**, because the site chose
it deliberately (`layout.tsx:34-39` argues the case: *"Feels editorial and
bespoke; not the default Inter-800…"*) and the site is the surface with the most
prior art. Then ship the two TTFs in `assets/fonts/`, point `orbit-branding.js`
at them, and inline the display face into `tokens.js` — which its own comment
already says is *"a one-line change here"*. Delete Oxanium, Sora and Geist Mono
from the bundle; three unused variable fonts are also three unused variable
fonts of MCPB payload.

---

## 3. The mark stamped on every export is single-polarity, and it's the wrong polarity for a dark reader

`buildOrbitMarkdownHeader` — the header on every Notion export
(`notion-export.js:133,170,181,208,231`) and every Braze pack
(`braze-pack.js:148,197,215,232`) — defaults to `ORBIT_LOGO_DARK_URL`. I checked
what that asset actually is:

```
$ python3 (PNG unfilter, get-orbit/public/images/orbit-icon-dark.png)
orbit-icon-dark.png w 112 h 112 colortype 6 bitdepth 8
corner 0,0 = (0, 0, 0, 0)
centre = (0, 0, 0, 255)
```

Black ink on full transparency. So every artifact Orbit exports opens its first
line with a mark that is invisible on any dark surface — Notion in dark mode,
GitHub in dark mode, a Slack unfurl at night. The recipient sees a title with a
smudge above it, or nothing at all.

`orbit-icon-white.png` is sitting in the same directory, unused by the exporter.
`ORBIT_LOGO_WHITE_URL` is even *declared* in `orbit-branding.js:12` and never
read. And the extension's own `icon.png` — white mark on an indigo rounded tile —
survives both polarities by construction, because it brings its own ground.

Fix: default `buildOrbitMarkdownHeader` to the indigo-tile mark, which cannot
disappear. Markdown has no `prefers-color-scheme`, so a duotone-safe asset is the
only correct answer; a `<picture>` element works on GitHub and nowhere else that
matters here. One-line change to the `logo` default.

Related, same file, same root cause: `icon.png`, `icon-light.png` and
`icon-dark.png` are byte-identical.

```
$ shasum -a 256 icon*.png
00e3da355ba409efc80c38c81cad62442dcdb3da885ddb3ef02080bda8c7398c  icon-dark.png
00e3da355ba409efc80c38c81cad62442dcdb3da885ddb3ef02080bda8c7398c  icon-light.png
00e3da355ba409efc80c38c81cad62442dcdb3da885ddb3ef02080bda8c7398c  icon.png
```

`BRANDING_ASSETS` in `orbit-branding.js:26-33` models a light/dark logo pair, the
build script copies both into `_orbit-branding/`, and `getOrbitLogoDataUri({theme})`
branches on a theme that changes nothing. It's an identity system that has the
shape of one and none of the substance — three filenames, one file. Either make
the second variant real or collapse the API to one asset; carrying a theme
parameter that resolves to the same bytes is how a later contributor ships a
logo that vanishes and the code says it handled it.

---

## 4. The product that builds brand kits has never made its own

This is the root cause of §2 and §3, and I think it is also the most interesting
piece of marketing Orbit isn't doing.

```
$ find . -name "*brand-profile*" -o -name "*.brand.json" -o -name "brand-guidelines*" | grep -v node_modules
./starter-brand-kit/brand-profile.template.json
./starter-brand-kit/brand-guidelines.template.md
```

Templates only. Orbit ships `orbit_build_brand_kit_draft`,
`orbit_write_brand_kit`, `orbit_validate_brand_kit` and
`orbit_start_brand_guidelines_intake`, plus a `starter-brand-kit/README.md` that
tells a stranger the minimum bar is *"one official logo, at least two example
assets, a `brand-profile.json`, a `brand-guidelines.md`"* — and Orbit clears none
of it. Look at the schema it hands out:

```json
{
  "brand_name": "", "primary_logo": "", "alternate_logo": "",
  "colors": {}, "example_assets": [], "fonts": [],
  "forbidden_treatments": [], "preferred_header_families": [], …
}
```

`primary_logo` / `alternate_logo` is §3. `fonts` is §2. The schema Orbit sells
predicts, field by field, exactly which parts of Orbit drifted. That is not a
coincidence — it's what a source of truth is *for*, and Orbit doesn't have one
because nobody ran the tool on the tool.

The credit here goes to whoever designed that schema: it's right. Use it.

**Fix, and it's the fun one:** run `orbit_build_brand_kit_draft` against Orbit,
commit the result to `brand/orbit.brand.json` + `brand/orbit.brand.md`, make
`tokens.js`, `orbit-branding.js` and `get-orbit/app/globals.css` read their
palette and font names from it, and add `orbit_validate_brand_kit` to CI so the
next drift fails a build instead of shipping.

Then put the artifact in the README under a heading like *"Orbit's own brand kit,
built by Orbit"* — a real, non-toy, published example of the exact output the
tool produces. Right now the brand-kit tools are four names in a list of 121; a
stranger has no way to know what one looks like. This turns an internal cleanup
into the first genuinely *shareable* proof-of-work Orbit has produced. Nebula's
bias, stated plainly: I'd rather ship one artifact that shows the work than three
more sentences describing it.

---

## What I looked at and deliberately did not file

- **Palette coherence.** `--brand: #6366F1` / `--brand-strong: #4F46E5` in
  `tokens.js` matches `globals.css:24-25` exactly. The colour half of the
  identity is clean and the widget-contrast work in `82bbddf` was done
  properly — pill text colours chosen against their wash, with a test that
  re-derives the ratios. That's the standard the typography should be held to.
- **The standalone artifact signature** (`shell.js:290-313`). It's text-only —
  "Made with Orbit — a free lifecycle marketer, built into Claude." — with no
  mark, and it fires only when un-embedded. Both calls are right: the mark would
  need to be a data-URI to survive the file leaving the machine, and inside the
  host the chrome is noise. The reasoning is written in the comment. Leave it.
- **The extension mark itself.** The planet-with-a-moon is a good mark. It reads
  at 22px in the SVG badge and at 512px on the tile, it's distinctive against a
  category full of gradient hexagons, and it's the same glyph on the site and in
  the bundle. Nothing wrong with the identity — only with its governance.
- **`orbit.md` and `orbit-lifecycle-os-claude.md`** — a Skill-format router and a
  Claude Project persona, two more distribution formats living unadvertised at
  the repo root. Interesting, but that's Iris/Echo's call on channel strategy,
  not mine, and `CLAUDE.md`'s "62 skills total" line next to the README's 77 is
  Pulsar's already-filed count-drift finding wearing a different hat.
- **The live homepage `og:description` still reading "$249, bought once."**
  Confirmed against production, but this is Iris R1 §1 and Pulsar R3 —
  a merge-and-deploy problem, not a new finding.

---

## The one-line version

Orbit's copy is now sharper than its identity: the link renders a default card
that prints a zero, the artifact that travels is set in a typeface the brand
doesn't use, the mark on every export vanishes in dark mode — and all three are
downstream of a brand-kit product that has never built a brand kit for itself.
Fix the fourth and the first three stop recurring.
