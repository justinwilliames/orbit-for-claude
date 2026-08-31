> Personas are fictional cognitive frames — see pulsar-team SKILL.md §1. Nothing here is a statement by or about a real person.

# R2 — Nebula × Echo, cross-reference

Read in full: `R1-atlas.md`, `R1-echo.md`, `R1-iris.md`, `R1-nebula.md`, `R1-nova.md`,
`R1-pulsar.md`, `R1-sentinel.md`, `R1-voyager.md`. Everything instrumented below names a
command we ran in this pass; nothing here re-derives a Round 1 finding.

---

## 0. Where the eight of us agree, and why that matters

Three items were found independently by drones with no shared lens: **no LICENSE**
(nebula, pulsar, sentinel-adjacent), **the signup wall in front of a free file**
(nebula, echo, pulsar, and Nova's modal finding points at the same door), and
**delete the star-history chart** (nebula, echo, iris).

nebula: eight lenses converging is not consensus, it is the same object seen from
eight angles — which is what a real defect looks like. Ship those three before
anything else in this document.

echo: and they are all the same shape — *the claim and the experience disagree*.
That's one root cause with three symptoms, which is the only reason I'll let a
"we all agree" section exist at all.

---

## 1. The finding that needs both lenses — and neither of us had it in R1

**`shareable-artifact-is-unbranded`**

`writeWidgetArtifact()` writes a standalone HTML copy of a widget with its data
baked in. It is the only thing Orbit produces that travels to a human who does
not have Orbit installed. We rendered one and read it.

```
$ node -e 'import("./server/ui/register.js").then(m=>m.writeWidgetArtifact({
    uri:"ui://orbit/review-gallery.html", data:{items:[{id:"a",name:"Welcome email",
    channel:"email",html:"<p>hi</p>"}]}, outPath:"/tmp/gal.html"}))'
WROTE /tmp/gal.html

$ grep -o "<a [^>]*href=[^>]*>" /tmp/gal.html
(no output — zero anchors in the entire document)

$ grep -o "<title>[^<]*</title>" /tmp/gal.html
<title>Orbit — Creative review</title>

$ grep -o -i "yourorbit[^\"' <]*" /tmp/gal.html
(no output)
```

Every other "orbit" hit in the file is a JS identifier (`window.ORBIT_BOOTSTRAP`,
`orbitNotifyHost`, `window.OrbitApp`). The only human-visible mention of the
product in the entire artifact is a `<title>` tag — a browser-tab label that
does not render in the document, does not appear in a screenshot of the page,
and does not survive being embedded or pasted.

Now hold that against `orbit.md`:

```
orbit.md:116  "'Orbit Intelligence' is the named capability the user is invoking;
               use the phrase wherever it frames a judgment, recommendation, or diagnosis."
orbit.md:534  "The phrase 'Orbit Intelligence' is used when framing judgment,
               diagnosis, or recommendation — not as filler, but as signature"
```

nebula: so the brand is *mandated* in the one room where everybody already knows
the brand — a chat session inside an installed extension — and *absent* from the
one object that leaves the building. That is the exact inversion of how a name
should be spent. A signature belongs on the work that travels, not on the
conversation with the person who commissioned it. Orbit currently signs the
receipt and leaves the painting blank.

echo: and this is the whole growth argument in one file. Orbit has no ads, no
directory listing that works (pulsar §2), 2 repo visitors in 14 days, and — per
my own R1 — an installed MCP has no natural re-engagement trigger. Which means
the *only* acquisition channel Orbit actually has is: a user who likes it shows
a colleague something Orbit made. That is the entire top of funnel. And the
artifact that does the showing has no name on it, no link, nothing a colleague
could type into a browser. A marketing manager opens a beautiful creative-review
console their agency sent them, approves four emails in it, and has no way to
find out what it was. That is a K-factor of exactly zero engineered by omission.

**Fix:** one footer row in `WIDGET_PRELUDE`'s shell — "Made with Orbit" linking
to `https://yourorbit.team`, rendered only on the standalone path
(`!orbitEmbedded`, the check already exists at `shell.js:204`), so it never
clutters the in-host widget. Under twenty lines. It is the cheapest distribution
Orbit will ever be able to buy.

nebula: and do it with restraint — a 11px muted line at the bottom, not a badge.
The widget's credibility is the pitch; a loud watermark would spend it.

---

## 2. The sharpened version of two separate R1 findings, which turn out to be one

**`no-repeatable-sentence-anywhere-a-stranger-lands`**

Echo R1 flagged `manifest.json`'s description as noun soup. Nebula R1 flagged
the "60+/80+" undercount across three surfaces. We enumerated every place Orbit
introduces itself, verbatim, and the real defect is neither of those.

| # | surface | first line a stranger reads |
|---|---|---|
| 1 | `README.md:3` | "A free, open lifecycle-marketing operating system for Claude Desktop." |
| 2 | GitHub repo description (`gh repo view`) | "Lifecycle-marketing OS for Claude Desktop — 60+ battle-tested skills and 80+ tools…" |
| 3 | `server.json:5` (registry storefront) | "Lifecycle-marketing OS for Claude: 60+ skills and 80+ tools for Braze, Stripo, email, segmentation." |
| 4 | `manifest.json:7` (install dialog) | "Lifecycle marketing, CRM, email, SMS, push, retention, deliverability, segmentation, experimentation, and martech operating system for Claude — Orbit Intelligence." |
| 5 | `server/index.js:292` (what the model is told) | "Lifecycle marketing operating system for Claude with guided discovery, production workspaces…" |
| 6 | `server/index.js:295` (server instructions) | "Orbit is a lifecycle-marketing operating system carrying 60+ battle-tested SKILLS…" |
| 7 | `get-orbit/app/layout.tsx:61-62` (every SERP + share card) | "The MCP that runs lifecycle marketing inside Claude — … $249, bought once." |
| 8 | `get-orbit/app/page.tsx:144` (homepage H1) | **"A lifecycle marketer, built into Claude."** |

echo: seven of eight are the same sentence wearing different hats — *"lifecycle
marketing operating system"* — which is a category, not a product, and which
nobody has ever repeated to another human being. Row 8 is the one sentence in
either repo that passes the friend-repeatable test: five words, one idea, a
non-expert hears it once and can say it back. *"A lifecycle marketer, built into
Claude."* It is on the surface a stranger reaches **last, or never**. GitHub gets
row 1. The registry gets row 3. The install dialog gets row 4. The good sentence
is locked in the room with the fewest visitors.

nebula: this reframes my R1 §5 and I'm glad to give it up. I filed the count
drift as a *modesty* problem — understating yourself by 41 tools. Wrong frame.
"60+ skills and 80+ tools" isn't modest, it's a **specification**, and a
specification is what you write when you have not decided what the thing is. The
numbers being stale is a symptom; the disease is that seven of eight surfaces
lead with an inventory instead of a claim. Fixing the numbers to "77 and 121"
and stopping there would leave the disease intact and the patient better
documented.

**Fix, in one move:** row 8 becomes the first line of README, the first clause of
`manifest.json.description`, the `server.json` description, the GitHub repo
description, and the opening line of the MCP instructions string. Inventory goes
second, everywhere, and gets generated from the manifest as Nebula R1 proposed.
One sentence, six files. It also happens to be the single highest-leverage thing
on the list for pulsar's sequencing, because **the registry copies the
description at publish time** — get it wrong and it is frozen into the storefront
until the next publish.

echo: and it fixes the install-dialog finding for free, which is why I'm
withdrawing my R1 #2 as a standalone item. Same sentence, same fix.

---

## 3. Where we fight — and one of us loses

### 3a. Nebula's "Orbit Intelligence belongs in the README" — **RETRACTED**

nebula: R1 §6 was mine and it was wrong. I argued the README should carry a
paragraph on Orbit Intelligence, because it is the one owned term and it is the
paragraph "that separates this from another marketing MCP."

echo: it separates nothing. A stranger who has never heard of Orbit is being
introduced to a *second* proper noun before they've accepted the first. Two
brands, zero recognition. Every dollar of attention spent explaining
sub-brand-of-a-thing-you-don't-know is a dollar not spent on "here's what
changes after you use it." I'd fight this even if the README were otherwise
perfect.

nebula: conceded, and the concession is not reluctant — the moment I read the
actual usage instructions I switched sides. This is worse than a naming nit.

### 3b. What we found instead — **`orbit-intelligence-is-a-signature-tax`** (new)

`orbit.md` does not merely define the term, it *mandates its use in the user's
own workspace*, on every substantive answer:

```
orbit.md:118  "### When to use the phrase 'Orbit Intelligence'"
orbit.md:120  Framing a diagnosis — "Orbit Intelligence reviewed the signals and found three active risks…"
orbit.md:121  Recommending an action — "Orbit Intelligence recommends pausing volume…"
orbit.md:122  Summarising findings across multiple tool calls
orbit.md:123  Acknowledging a trade-off it resolved
orbit.md:534  "…not as filler, but as signature"
```

Diagnosis, recommendation, synthesis, trade-off — that is every non-trivial
answer Orbit will ever give.

nebula: the same file demands the posture of "a senior lifecycle operator working
as an extension of the user's team" (`orbit.md:116`). Senior operators do not
refer to themselves in the third person by product name. A colleague who said
"Orbit Intelligence recommends pausing volume" in a standup would be asked to
sit down. The instruction is internally contradictory: it asks for the voice of
someone confident enough not to need a badge, and then requires the badge on
every sentence.

echo: and the funnel cost is concrete. First session, first real answer, a
stranger who came for "does this know Braze" gets marketing vocabulary
inside their workspace. That is the moment they decide whether this is a tool
or a pitch. Every enterprise product that does this is one a user was already
forced to adopt. Orbit has to be *chosen*.

**Fix:** keep the term defined in `orbit.md` for reference and drop it from the
voice contract — delete lines 118–129's mandate and 534's checklist item. Reserve
it for exactly one place: the standalone artifact footer from §1, where a name is
doing acquisition work instead of ornament work.

Severity: medium. It will not move the star count on its own, and we say so.
It is filed because it is the *only* R1-adjacent item where the fix is deleting
brand copy rather than adding it, and because it makes §1's ask coherent — you
cannot argue for a name on the artifact while the name is being over-spent in
chat.

### 3c. Nova's download counter — right conclusion, **wrong mechanism**, wrong fix

Nova R1 §4 (`download-counter-undeduped-social-proof`) says: "Every click of the
download button inserts a row… Fix: dedupe by visitor (cookie/fingerprint)."

We checked the call graph. The click handler does not exist.

```
$ cd get-orbit && grep -rn "useTrackDownload" app components lib
components/download-counter.tsx:81:export function useTrackDownload() {
```

One hit — its own export. **Zero call sites anywhere in the app.** The hook with
the careful `sendBeacon` comment ("a plain fetch() is aborted the moment the
browser follows the .mcpb href, so it was dropping most real downloads") is dead
code. Nothing on the site calls it.

The counter is actually written by two things:

```
app/api/mcpb-download/route.ts:101   trackDownload(trafficType ?? null)   ← a real .mcpb fetch
app/api/downloads/route.ts:22        export async function POST()         ← no body, no auth,
                                       no rate limit, no origin check
```

echo: so a cookie-based dedup fixes a click path that isn't wired, and leaves the
open POST — the one anybody can hit with a bare curl in a loop — untouched.
Nova's *conclusion* stands and I'll defend it against anyone: unaudited social
proof in front of a skeptical CRM audience is a liability. But the named fix
would be a day of work on the wrong route.

nebula: and the copy ladder is worse than Nova described, because Iris's
mitigating note is not accurate. Iris R1 "What I'm not flagging" says the
counter "self-hides below a threshold rather than showing something sad." It
does not:

```
download-counter.tsx:21   if (count <= 10) { setDisplayed(count); return; }   ← skips the
                                                                                count-up animation
download-counter.tsx:38   if (count === null || count === 0) return null;     ← the ONLY hide
```

The `<= 10` threshold is an *animation* branch, not a visibility one. The
component hides at zero and at nothing else. At `count === 1` the homepage
renders "Be an early adopter — **1** install so far."

**Corrected fix:** (a) delete the dead `useTrackDownload` export — it is a
comment about a bug in a path that no longer exists, and it will cost somebody
an afternoon in six months; (b) close or rate-limit `POST /api/downloads`, which
is the actual inflation vector; (c) take Voyager's number — `COUNT(DISTINCT
client_id) FROM mcp_telemetry` — and stop describing site-side .mcpb fetches as
"installs", because they aren't, and the copy ladder says "marketers have
installed Orbit" at every tier above 10.

### 3d. Atlas's WCAG pills — correct defect, **wrong priority**

nebula: Atlas R1 §1 is careful, instrumented work and the numbers are right —
2.90:1 on the WARN pill is a real failure and the irony is genuinely bad. But
Atlas rates it *high* on the argument that "a stranger runs `orbit_render_gate`,
gets a WCAG citation, and sees the tool failing its own bar in the same screen."

Hold that against two other R1 findings: Sentinel §2 proves the widget bridge is
not in the shipped bundle, and Pulsar §5 proves the README mentions the widgets
zero times. The population of strangers who reach that screen today is
approximately the population of this review.

echo: right — it's a defect with no audience yet. It is a *prerequisite* for
§1 and for the "put the widgets on the front door" work, not a competitor to it.
Fix it in the same afternoon you take the screenshots for the README, because
shipping a screenshot of a failing contrast pill is the version of this that
actually costs something.

nebula: no retraction asked for, no severity fight worth having in public — just
put it after the thing that creates its audience.

---

## 4. One more sharpening: the portable surface is opt-in

**`artifact-path-opt-in-on-the-only-portable-surface`**

Sentinel's blocker (`widget-bridge-not-in-mcpb`) establishes that on a real
install `window.OrbitApp` is null and every send-back-to-chat affordance is dead.
The widget still paints; it just can't talk.

The standalone artifact is unaffected by that, and the code says why:

```
shell.js:203  const orbitEmbedded = (() => {
                try { return window.parent && window.parent !== window; } catch { return true; }
              })();
```

A file opened from disk is top-level, so it never attempts the handshake and
never needed the bridge. So today the artifact is the only widget surface that
behaves identically for everyone on earth — and it is written only when the
model happens to pass a path:

```
server/index.js:1326   artifact_path: z.string().max(MAX_PATH_STRING).optional(),
server/index.js:1359   if (artifact_path) { artifact = writeWidgetArtifact({…}) }
server/index.js:5559   (same gate on orbit_render_gate)
```

echo: so the one durable, portable, colleague-shaped output Orbit can produce
requires the model to invent a filesystem path unprompted, from a clause at the
end of a 40-word tool description. It will fire sometimes. "Sometimes" is not a
distribution channel.

nebula: default it. Write to the workspace Orbit already creates on first run,
always, and let `artifact_path` override. Then the tool's closing line becomes
"Standalone copy written to ~/Orbit/reviews/…— send it to whoever needs to sign
off," which is both a better product sentence and the sentence that puts §1's
footer in front of a stranger.

Severity: medium-high, and it is cheap — a default value and one line of summary
copy. It only pays off once §1 lands; file them together.

---

## 5. Retractions and corrections we owe

| what | who | status |
|---|---|---|
| "Orbit Intelligence belongs in the README" (R1 §6) | nebula | **RETRACTED** — see 3a. Replaced by 3b, which argues the opposite direction. |
| "the count drift is a modesty problem" (R1 §5) | nebula | **REFRAMED** — the drift is a symptom; §2 is the disease. Fixing the numbers alone would close the wrong ticket. |
| "77 skills, 119 tools" as suggested replacement copy (R1 §3) | echo | **CORRECTED** — `node -e "require('./manifest.json').tools.length"` → **121**. Atlas R1 §2 carries the same 119. Shipping either would re-create the drift being fixed. |
| "I didn't find a retention-loop gap worth a finding" (R1, closing) | echo | **RETRACTED** — I looked for a *come-back* trigger and correctly found none needed. I did not look for a *travel* mechanism, which is where the actual loop lives, and it is broken (§1). Wrong question, confidently answered. |
| "the download counter self-hides below a threshold" (R1, not-flagging note) | iris | **CORRECTED** by instrumentation — hides only at zero; the `<=10` branch is animation. See 3c. |
| "dedupe the counter by cookie/fingerprint" (R1 §4) | nova | **MECHANISM CORRECTED** — the click path has zero call sites; conclusion stands, fix relocated. See 3c. |

---

## 6. What we deliberately did not file

nebula: the widget palette is still stock Tailwind indigo/amber/emerald and it
is still my professional pet hate. It is still not why nobody has starred this.
Holding.

echo: I went looking for a second acquisition loop beyond §1 — a share affordance
in the QA/audit widgets, an export anyone forwards, a public gallery URL — and
there isn't one to critique. That's not a finding, that's the same finding.
Naming it so R3 doesn't file it twice.

nebula: and the writing in `server/ui/` headers remains the best prose in either
repo. We are asking for one footer line and one sentence propagated. Nobody
should touch the reasoning comments.

---

## Verdict

echo: two things move the number this review exists to move, and both are about
the same object — **make the sentence travel** (§2) and **make the artifact
travel** (§1). Everything else in our lane is hygiene behind those.

nebula: and one thing we thought was an asset is a tax (§3b). Take the badge off
the conversation and put it on the work. That is the whole of our contribution
in one line, and it happens to be free.
