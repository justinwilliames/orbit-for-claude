/**
 * Stamp server.json with the version and checksum of a real .mcpb.
 *
 * The MCP registry entry is the only channel built for strangers, and it
 * served an unverifiable file: the live entry pinned a fileSha256 that did
 * not match its own release asset, so any installer honouring the checksum
 * refused the download. The previous version's entry matched exactly,
 * which is the tell — the process worked once by hand and then silently
 * produced a wrong hash. A hash typed by a human is a hash that will be
 * wrong eventually.
 *
 * So: nothing writes fileSha256 except this script, and it only ever
 * computes it from a file on disk that was JUST built. The checked-in
 * server.json carries an empty fileSha256 on purpose — it is a template,
 * not a publishable document, because the correct value cannot exist
 * until the asset does.
 *
 * Usage:
 *   node scripts/build-server-json.mjs <path-to.mcpb> [--out server.json]
 *
 * The version comes from manifest.json, never from an argument, so the
 * registry entry cannot claim a version the bundle isn't.
 */

import fs from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";
import { fileURLToPath } from "node:url";

const ROOT_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

const [assetArg, ...rest] = process.argv.slice(2);
if (!assetArg) {
  process.stderr.write("usage: node scripts/build-server-json.mjs <path-to.mcpb> [--out <file>]\n");
  process.exit(1);
}
const outIndex = rest.indexOf("--out");
const outPath = path.resolve(outIndex === -1 ? path.join(ROOT_DIR, "server.json") : rest[outIndex + 1]);

const assetPath = path.resolve(assetArg);
if (!fs.existsSync(assetPath)) {
  process.stderr.write(`No such file: ${assetPath}\n`);
  process.exit(1);
}

const { version } = JSON.parse(fs.readFileSync(path.join(ROOT_DIR, "manifest.json"), "utf8"));
const sha256 = createHash("sha256").update(fs.readFileSync(assetPath)).digest("hex");

const template = JSON.parse(fs.readFileSync(path.join(ROOT_DIR, "server.json"), "utf8"));
template.version = version;
template.packages = template.packages.map((pkg) => ({
  ...pkg,
  identifier:
    "https://github.com/justinwilliames/orbit-for-claude/releases/download/" +
    `v${version}/${path.basename(assetPath)}`,
  fileSha256: sha256,
}));

fs.writeFileSync(outPath, `${JSON.stringify(template, null, 2)}\n`);
process.stdout.write(`server.json stamped: v${version}, sha256 ${sha256}\n`);
