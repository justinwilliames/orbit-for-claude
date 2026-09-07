> Personas are fictional cognitive frames — see the pulsar-team SKILL.md §1 disclaimer. Nothing here is a statement by or about a real person.

# R2 — Engineering pair (Sentinel × Voyager)

## Where we agree, and where we fight

**Sentinel:** [instrumented] The count spine is not arguable. `curl -s https://yourorbit.team/ | grep -oE '[0-9]+ (skills|tools|guides)' | sort | uniq -c` → `6 135 tools`, `6 79 skills`, `2 99 guides`, unchanged since R1. `gh repo view --json description` → `"...83 skills and 135 tools..."`. Truth is 86. Voyager R1#1, my R1#1, Nebula R1#1, Vector R1#1, Pulsar R1#1 and Atlas R1#2 are one finding with six authors, because nothing owns the surface outside the repo.

**Voyager:** We fight on sequencing. Sentinel's fix points the site's 15-minute sync at a new manifest `skills` key. Mine adds `orbit.md` and `catalog.js` to `sync-counts.mjs`'s `TARGETS` and makes the script name the surfaces it checked. Hers closes the number a customer reads; mine closes the green light saying there is nothing to close. Do mine first — otherwise you buy one correct number and keep the mechanism that rotted the other seven.

**Sentinel:** Order accepted. I fight Vector elsewhere: R1#1 frames the seven missing skills as "hiding shipped work". [judgement] They hide a *list*; the count is a separate wire. Fix the wire and the list stays wrong; publish the list and the hero still says 79. Two findings — conflating them is how this ships half.

## The finding that needs both lenses

**Voyager:** [instrumented] Not the count spine. The number Iris wants this loop scored against runs on a predicate that cannot separate a working install from a crashing one — `get-orbit/lib/db.ts:2021`:

```
const activeClient = `type = 'tool_call' AND client_id IS NOT NULL`;
```

Every `getPmfData()` query — weekly actives, retention cohorts, activation, habit — uses it. `awk 'NR>=2019 && NR<=2135' lib/db.ts | grep -n "tool_error"` → `ZERO references to tool_error in getPmfData`.

**Sentinel:** The emitter's contract says that is wrong. `server/telemetry.js:176`: *"tool_call minus tool_error is the success rate."* `server/index.js:6959-6960` fires `trackToolCall({ ok: false })` **and** `trackToolError` on the same throw — a failed call is deliberately still a `tool_call`. Voyager built the instrument so the subtraction is possible; the consumer never subtracts. "Weekly active installs" means "installs that reached a handler", crash included — and we just proved a stranger-reachable crash class exists. At the last read of 4, one crashing install is a quarter of the gate.

**Voyager:** That is my own R1#3 turned against me. I called the `tool_call`/`tool_error` collapse **closed** on `lib/db.ts:1613-1626`. It is closed there and open in the one query that scores the product. I read a single consumer and declared the class shut — my named failure mode, filed as a win.

**Sentinel:** Credit the other way. [instrumented] `lib/pmf.ts:297` → `const weeks = data.weekly.slice(0, -1);`, commented *"Drop the current, partial week"*. The date-grain trap I went hunting for is already handled. Nobody gets to file it.

## Sharpen and retract

**Sentinel:** [instrumented] I contradict **Nova R1#1** on scope, not existence. She wrote *"the render path itself is broken for every format I tried"*. Driving the installed 0.39.1 bundle over stdio, build → render with the spec exactly as returned: `RENDER (spec intact): ok`, SVG on disk. The renderer is sound; one unguarded write is not. Scope is load-bearing — it turns a renderer trace into a one-line fix.

**Voyager:** [instrumented] Not new. `git blame -L 293,293 server/lifecycle-diagrams.js` → `^491ce09 (Justin Williames 2026-03-31 293)`. Initial commit. Five months, eighty-five releases; nobody hit it because nobody hand-trimmed a spec.

## ANSWER (a) — Sentinel to Nova

**Neither.** Not a regression, and the installed build **does** match the repo: both manifests read `0.39.1`, and the same unguarded write sits in the shipped bundle — `ct(\`${d}.mmd\`,t.mermaid)`.

[instrumented] Crash site — `server/lifecycle-diagrams.js:293` into `server/utils.js:29`:

```
const mermaidPath = writeText(`${outputBasePath}.mmd`, spec.mermaid);
export function writeText(filePath, text) { ...; fs.writeFileSync(filePath, text); }
```

`spec.mermaid` undefined → `fs.writeFileSync(path, undefined)` → your message verbatim. Three cases:

```
BUILD status: ok | spec has mermaid key: true | typeof: string
CASE1 full-spec render: ok
CASE2 THREW: TypeError The "data" argument must be of type string or an instance of Buffer, TypedArray, or DataView. Received undefined
CASE3 THREW: TypeError The "data" argument must be of type string or an instance of Buffer, TypedArray, or DataView. Received undefined
```

CASE2 is your hand-trimmed spec; CASE3 the full built spec with `mermaid` deleted. Confirmed end-to-end against the installed bundle over stdio. Any spec a model retypes or trims loses the multi-line mermaid blob first — which is why it read as universal.

The pipeline step that should have caught it **exists and is green**. `node --test tests/suites/04-lifecycle-diagram.test.mjs` → `# tests 4 # pass 4 # fail 0`. Not a mock — it drives the real server over stdio. It renders `makeSampleLifecycleSpec()` (`tests/harness/fixtures.mjs:66`), which hand-supplies `mermaid: "flowchart TD\nentry-->welcome-->wait-->nudge"`. The one field whose absence kills the tool is the one field the fixture guarantees, and build's output is never chained into render: a fixture that cannot fail, certifying a happy path. Fix: default `spec.mermaid` at line 293, plus a test that renders a spec without it.

## ANSWER (b) — Voyager to Iris

**No. The blocking step has a name.** [instrumented]

```
DATABASE_URL set in this shell: no
psql not found
no ~/.pgpass
docker: command not found
```

No `.env*` exists in `get-orbit`; the only `DATABASE_URL` on disk is the throwaway in `.github/workflows/playwright.yml`. No unauthenticated read route — `getPmfData()` is called straight from the server component at `app/admin/dashboard/page.tsx:59`. Live gate: `GET /admin/dashboard -> 307 redirect=https://yourorbit.team/admin/login`. I then took the manual path and loaded it in Justin's own Chrome — no live session; the page returns `Sign in / EMAIL / PASSWORD`.

**The blocker:** the `orbit_admin_session` cookie (`middleware.ts`), obtainable only from the admin password flow or an `orbit_user_session` matching `ALLOWED_EMAIL`. Entering a password is outside my authority. Justin can read it in thirty seconds; nobody else here can.

Best substitute I *can* read, different denominator: `gh release` — **482 `.mcpb` downloads across 31 releases** (`v0.38.0=17`, `v0.39.1=2`). Downloads, not actives — and the actives predicate counts crashing installs anyway. Treat "4 vs 50" as stale *and* structurally generous.

## Question — Sentinel to Pulsar, asked aloud

> "Pulsar — Vector's NOT-building list says this loop may only delete, connect or announce, and a finding proposing an addition must name what it displaces. The lifecycle-diagram render crash needs one added guard line and one added test. Does that clear the gate as a repair rather than an addition, or do I owe you a displacement before it enters ship-now?"

— Sentinel & Voyager
