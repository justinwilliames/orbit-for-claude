#!/usr/bin/env node
/**
 * Render every Orbit widget to standalone HTML so a human (or a browser
 * agent) can actually LOOK at them.
 *
 * WHY THIS EXISTS. Orbit ships 23 `ui://` widgets and until 2026-08-24 not
 * one had ever been visually verified. The test suite proves they don't
 * throw; it cannot tell you the grid collapsed to 47px and the user is
 * staring at column headers with no data. That is exactly what was found
 * the first time anyone looked — see the KNOWN DEFECT note in
 * server/ui/widgets/esp-matrix.js.
 *
 * Claude's own window cannot be driven by Claude (it would let the model
 * operate its own permissions), so "watch it render in the app" is not an
 * option and never will be. This renders the SAME html the host renders,
 * to disk, where any browser can open it.
 *
 * Usage:
 *   node scripts/render-widgets.mjs [outdir]
 *   cd <outdir> && python3 -m http.server 8899
 *   ...then open http://127.0.0.1:8899/<widget>.html
 *
 * Serve over HTTP rather than file:// — these run JS, and file:// origins
 * break the module/bridge paths.
 *
 * TWO STATES PER WIDGET, and both are worth looking at:
 *   <slug>.html        — the empty state, exactly what a user sees before
 *                        a tool has run. Rendered with no data.
 *   <slug>.data.html   — the populated state, where layout actually gets
 *                        stressed. Only produced where a fixture exists
 *                        below; add more as they are needed.
 *
 * HONEST LIMIT 1: a widget's interactive path talks to the host's ext-apps
 * bridge, which does not exist in a plain browser. Layout, contrast,
 * overflow, empty states and baked data all verify correctly here. Live
 * host round-trips do not.
 *
 * HONEST LIMIT 2, the bigger one: only ONE of the 23 widgets has a data
 * fixture below, so 22 are verified only in their EMPTY state — and an
 * empty widget has no content to collapse, so a clean sweep across them
 * proves close to nothing. The defect found on 2026-08-24 was only
 * visible with data loaded. Most widget-bearing tools live in the
 * server/index.js monolith and need the MCP client harness
 * (tests/harness/mcp-client.mjs) to exercise; wiring that in is the work
 * that would make this script honest across the whole set.
 *
 * THE DEFECT SIGNATURE, for whoever automates this next. Load a populated
 * widget at ~900x520 and look for a scrollable element whose scrollHeight
 * dwarfs its clientHeight:
 *
 *   sh > 150 && h < 150 && sh > h * 3
 *
 * That is "the user is peering at data through a slot". Calibrate against
 * the known case — .grid-box in the ESP matrix reads 71px visible against
 * 592px of content, a ratio of 8.3. A first pass at this used h < 70 and
 * cheerfully reported zero defects while the 71px case sat in front of
 * it; pick the threshold from the real measurement, not a round number.
 */

import fs from "node:fs";
import path from "node:path";

const OUT = path.resolve(process.argv[2] ?? "./tests/outputs/widgets");
fs.mkdirSync(OUT, { recursive: true });

const { ORBIT_WIDGETS } = await import("../server/ui/register.js");

/**
 * Fixtures for the populated state, keyed by a substring of the widget uri.
 * Each returns the structuredContent its tool would hand the host — taken
 * from the real handler wherever possible, so the fixture cannot drift from
 * what actually ships.
 */
const FIXTURES = {
  "esp-matrix": async () => {
    const { ESP_TOOL_DEFINITIONS } = await import("../server/esp/tools.js");
    const def = ESP_TOOL_DEFINITIONS.find((d) => d.name === "orbit_esp_capabilities");
    return (await def.handler({})).structuredContent;
  },
};

let empty = 0;
let populated = 0;
const failures = [];

for (const widget of ORBIT_WIDGETS) {
  const slug = widget.uri.replace(/^ui:\/\//, "").replace(/[^a-z0-9]+/gi, "-");

  try {
    fs.writeFileSync(path.join(OUT, `${slug}.html`), await widget.render());
    empty++;
  } catch (error) {
    failures.push(`${slug} (empty): ${error.message}`);
  }

  const fixtureKey = Object.keys(FIXTURES).find((k) => widget.uri.includes(k));
  if (!fixtureKey) continue;
  try {
    const data = await FIXTURES[fixtureKey]();
    fs.writeFileSync(path.join(OUT, `${slug}.data.html`), await widget.render(data));
    populated++;
  } catch (error) {
    failures.push(`${slug} (data): ${error.message}`);
  }
}

console.log(`widgets: ${ORBIT_WIDGETS.length}`);
console.log(`  empty-state rendered: ${empty}`);
console.log(`  populated rendered:   ${populated} (fixtures exist for ${Object.keys(FIXTURES).length})`);
console.log(`  output: ${OUT}`);
if (failures.length) {
  console.log(`\nFAILED (${failures.length}):`);
  for (const f of failures) console.log(`  ${f}`);
  process.exitCode = 1;
}
