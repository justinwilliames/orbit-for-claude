# Orbit Setup

Orbit runs locally in two places: Claude Desktop (the canonical install path) and Claude Code CLI (optional, for terminal sessions).

## Core Setup (Claude Desktop)

1. Install the Orbit `.mcpb` extension in Claude Desktop.
2. Open `Settings > Extensions`.
3. Open the Orbit extension settings.
4. Add credentials only if you plan to use the matching features:
   - `Default Platform`
   - `Default Geography`
   - `Google AI API Key`
   - `Figma API Token`
   - `Braze API Key`
   - `Braze REST Endpoint`

## Running Orbit in Claude Code CLI

Desktop's MCPB extensions and the CLI are separate processes with separate config sources. Installing the `.mcpb` in Desktop does not load Orbit MCP in CLI sessions. To use Orbit MCP from `claude` in a terminal, register the same server at CLI user scope.

There are two source paths you can point CLI at:

| Source | Path | When to pick it |
|---|---|---|
| Unpacked MCPB | `~/Library/Application Support/Claude/Claude Extensions/local.mcpb.<id>/server/index.js` | You want CLI to match Desktop exactly, including auto-updates. Path changes if Desktop bumps the version. |
| Dev source (recommended for contributors) | `~/code/orbit-for-claude/server/index.js` | You want CLI to run the latest local checkout. Stable path. Decouples from Desktop's update cycle. |

Registration command (replace each `<value>` with the matching credential):

```bash
claude mcp add --scope user \
  --env=ORBIT_COMPANY_NAME='<your company>' \
  --env=ORBIT_DEFAULT_PLATFORM='<braze|iterable|hubspot|other>' \
  --env=ORBIT_DEFAULT_GEOGRAPHY='<eg. AU, NZ, UK>' \
  --env=ORBIT_GOOGLE_AI_API_KEY='<key>' \
  --env=ORBIT_BRAZE_API_KEY='<key>' \
  --env=ORBIT_BRAZE_REST_ENDPOINT='<rest endpoint>' \
  --env=ORBIT_STRIPO_PLUGIN_ID='<id>' \
  --env=ORBIT_STRIPO_SECRET_KEY='<key>' \
  --env=ORBIT_STRIPO_REST_API_TOKEN='<token>' \
  --env=ORBIT_STRIPO_WORKSPACE_ID='<id>' \
  --env=ORBIT_STRIPO_MASTER_TEMPLATE_ID='<id>' \
  orbit -- node /path/to/orbit-for-claude/server/index.js
```

Three things to know:

- **Use `--env=KEY=VAL` (long form with `=`), not `-e KEY=VAL`.** The short variadic form slurps the server name as another env value and the registration fails.
- **Credentials are encrypted at rest** by the CLI in `~/.claude.json` (`__encrypted__:` prefix). No plaintext storage.
- **Already-running CLI sessions won't see the new server.** MCP servers register at session start. Open a new `claude` session and run `claude mcp list` to confirm `orbit: ... ✓ Connected`.

To remove or re-register: `claude mcp remove orbit -s user`, then re-run the add command.

## Orbit Home Workspace

Orbit now creates its own local workspace automatically on first run:

```text
~/Orbit/
  brand-kit/
  library/
  outputs/
  imports/
  docs/
```

You do not need to pick folders during normal setup. Orbit fills in missing folders and starter files automatically, and it does not overwrite existing user content inside `~/Orbit`.

## Local Storage And Backups

- Orbit stores your templates, brand kit, tone of voice, reusable components, imported references, previews, and program outputs locally on this device.
- If you want to keep that state, back up the entire `~/Orbit` folder.
- Moving to a different device starts from a fresh Orbit state unless you restore `~/Orbit` on that device.

## What Needs Configuration

- `Default Platform`
  - Optional default if you mainly work in Braze, Iterable, or HubSpot.
- `Default Geography`
  - Optional default for compliance-aware recommendations.
- `Google AI API Key`
  - Required for brand-header rendering with Gemini.
- `Figma API Token`
  - Required only for importing structured email designs from Figma.
- `Braze API Key`
  - Required only for publishing Content Blocks or HTML templates to Braze.
- `Braze REST Endpoint`
  - Required only for Braze publishing.

## Brand Kit Structure

Orbit stores the brand kit under `~/Orbit/brand-kit/` by default:

```text
~/Orbit/brand-kit/
  brand-profile.json
  brand-guidelines.md
  logos/
    primary-logo.svg
    alternate-logo.svg
  examples/
    email-header-1.png
    email-header-2.png
    campaign-reference-1.png
```

Orbit ships with a starter folder in `starter-brand-kit/`.

## Chat-First Brand Kit Setup

Orbit's brand setup flow is chat-first:

1. Gather the brand inputs in chat.
2. Call `orbit_build_brand_kit_draft` to create a reviewable draft.
3. Review the generated `brand-profile.json`, `brand-guidelines.md`, and asset plan.
4. Call `orbit_write_brand_kit` after approval to write the kit into `~/Orbit/brand-kit/`.

For v1, asset ingestion uses local file paths rather than chat-uploaded files.

## What Works Without Extra Keys

- skill routing
- template loading
- Orbit validators
- lifecycle diagram spec generation
- lifecycle diagram rendering to SVG, PNG, and PDF
- brand-header spec generation
- Orbit home-workspace bootstrap

## What Needs Extra Credentials

- `orbit_render_brand_header`
- `orbit_import_figma_email_design`
- `orbit_sync_braze_content_blocks`
- `orbit_sync_braze_email_template`
- `orbit_publish_email_to_braze`

Orbit uses Gemini only for the art layer of brand-header rendering. Orbit keeps logo placement, safe zones, and text placement deterministic in code.

## Recommended First-Run Flow

1. Install Orbit and let it create `~/Orbit`.
2. Set `Default Platform` if you mostly work in Braze, Iterable, or HubSpot.
3. Run `orbit_check_setup` to confirm the workspace and credentials Orbit can see.
4. Run the guided brand-kit intake when you want Orbit to create brand guidelines and brand assets.
5. Add `Google AI API Key` only if you want Orbit to render brand headers.
6. Add `Figma API Token` and Braze credentials only if you plan to import from Figma or publish directly to Braze.
7. Back up `~/Orbit` if you want your Orbit templates, brand information, and library to move with you between devices.

## Troubleshooting

- Run `orbit_check_setup` to see what is missing.
- Run `orbit_validate_brand_kit` to verify `brand-profile.json`, `brand-guidelines.md`, logo files, and example assets.
- Use `orbit_update_brand_guidelines` to revise the longform brand guide without redoing the full intake.
- Use `orbit://privacy/image-generation` if you need the payload/privacy summary.
