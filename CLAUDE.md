# CLAUDE.md — orbit-for-claude

## What this repo is

The **Orbit MCP extension** for Claude Desktop, packaged as a `.mcpb` bundle. Local-only stdio transport. Distributed from the private Tigris bucket fronted by `get-orbit`'s `/api/mcpb-download`. Sibling repos: `get-orbit` (website + admin), `orion-by-orbit` (macOS dock companion), `orbit-dictation` (menu-bar dictation fork).

Two surfaces in one extension:
1. **Skill router** (`orbit.md`) — disambiguates the user's request and selects the right specialist protocol from `skills/`. 62 skills total.
2. **Tool layer** (`server/`) — 80+ tools backing the skills. ESM JS, no TypeScript, Zod for input validation.

## Repo map

| Path | What's inside |
|---|---|
| `manifest.json` | MCPB manifest. Version is the source of truth; `package.json.version` must match (CI `check` script enforces). |
| `orbit.md` | Master skill router — what Claude reads first to decide which protocol to apply. |
| `skills/*.md` | 62 specialist protocols, one per lifecycle/CRM concern. YAML frontmatter (`name`, `description`) drives Claude's trigger logic. |
| `server/index.js` | Monolithic entry point: tool registration + dispatch + telemetry. ~4,800 LoC. **Known target for splitting** — see `Deferred refactors` below. |
| `server/catalog.js` | Skill registry + manifest builder. Loaded at startup. |
| `server/braze-*.js` | Braze API client surface, fragmented across 4 files. **Known target for consolidation.** |
| `server/lifecycle-diagrams.js` | SVG → PNG diagram rendering (~2,500 LoC). |
| `server/input-limits.js` | Central per-field caps used by every Zod schema. Never bypass. |
| `scripts/build-extension.js` | esbuild bundle into `.mcpb-build/`, ready for `mcpb pack`. |
| `scripts/fetch-guides.mjs` / `fetch-courses.mjs` | Sync practitioner guide and course content from `get-orbit`. |
| `tests/` | Integration tests + fixtures. No unit coverage on calculators/validators yet. |
| `evals/` | Skill-router evaluation harness. |

## Build & release

- `npm run check` — version-sync + `node --check` syntax pass on every server file.
- `npm run build:extension` — esbuild bundle into `.mcpb-build/`.
- `npm run pack` — produces `orbit-lifecycle-marketing-system-for-claude.mcpb`.
- `npm test` — integration tests via `tests/run.mjs`.

CI (`.github/workflows/build-mcpb.yml`):
1. `npm ci` → `npm audit --omit=dev --audit-level=high` → `npm run build:extension` → `mcpb pack`.
2. Upload three objects to the private Tigris bucket: versioned `.mcpb`, `latest.mcpb`, and `manifest.json`.
3. Dispatch a `repository_dispatch` event to `get-orbit` so the website's `lib/orbit-version.ts` updates within 30s. Fallback: 15-min cron picks it up.

## Voice & content rules (cross-repo, do not violate)

- Brand voice is canonical in `get-orbit/lib/admin/voice-guidelines.ts`. 5 pillars, 9 rules, slop list. Any user-visible string must conform.
- **Customer-facing changes get same-session changelog entries** in `get-orbit/lib/changelog.ts`, slug-keyed by MCPB version. Filter to what a user actually cares about — strip CI/refactor noise.
- Never have an LLM in CI write release notes or changelogs. Editorial content is written by Claude during the session that ships the change.

## Skill design conventions

- Each `skills/*.md` has YAML frontmatter (`name`, `description`). The description is the trigger language — keep it tight, keyword-rich, and exclude phrases that should *not* fire the skill.
- `orbit.md` is the master router. Update it when adding/removing a skill so it knows about the new protocol.
- Anti-slop discipline: `skills/anti-slop-editor.md` is the quality gate. Surface to users when reviewing copy.

## Adding a new tool

1. Define the Zod input schema with caps from `server/input-limits.js`.
2. Add the handler in the relevant `server/<domain>.js` (or create a new module if the domain is genuinely new — don't bolt onto a misaligned file).
3. Register it in `server/index.js` (`registerTools()` block).
4. Add a fixture under `tests/fixtures/` and an assertion in the matching `tests/suites/` file.
5. If user-visible, add a `lib/changelog.ts` entry on `get-orbit` in the same session.

## Adding a new skill

1. Create `skills/<slug>.md` with frontmatter (`name`, `description`).
2. Update `orbit.md` master router to know about it.
3. If the skill calls a new tool, follow `Adding a new tool` above.
4. Bump `manifest.json` version (and `package.json.version` to match).

## Security & safety

- API keys (Braze, Figma, Google AI, etc.) flow through `manifest.json` `user_config`, marked `sensitive: true`. Never log them.
- All Zod schemas pull caps from `server/input-limits.js`. Don't define ad-hoc limits inline.
- Braze API responses are parsed permissively (cheerio + optional chaining) — schema-level validation is a known gap. **Don't trust deeply nested response shapes blindly.**

## Deferred refactors (not blocking, do not start in passing)

These are tracked, not bugs:
1. **Split `server/index.js`** into `server/tools/registry.js` + `server/tools/dispatch.js`. The current 4,800-LoC monolith entangles tool registration with dispatch and telemetry.
2. **Consolidate Braze client** — `braze-api.js`, `braze-canvas.js`, `braze-read.js`, `braze-sync.js` each re-implement auth, retry, and error classification. Pull a shared `server/braze-client.js`. Unblocks Braze response schema validation.
3. **Add ESLint** with a minimal flat config. Existing code will surface dozens of warnings (unused vars, undeclared globals); triage before making the gate enforcing.
4. **Unit test pass on calculators + validators** — currently zero unit coverage on `calculators.js`, `segmentation-math.js`, `ecomm-calcs.js`.
5. **Skill enable/disable toggle** in `manifest.json` `user_config` so a broken skill can be silenced per-install without a redeploy.

## Tooling notes

- ESM throughout (`"type": "module"`). `require()` is unavailable.
- Node 20+ required. `package-lock.json` pinned.
- The `check` script is the closest thing to a fast smoke test before committing — run it.
