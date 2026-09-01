import fs from "node:fs";
import path from "node:path";
import { execSync } from "node:child_process";
import { createRequire } from "node:module";
import { build } from "esbuild";

const ROOT_DIR = process.cwd();
const BUILD_DIR = path.join(ROOT_DIR, ".mcpb-build");
const BUNDLE_SERVER_DIR = path.join(BUILD_DIR, "server");

// Version consistency guard — THREE files, not two. server.json was the
// missing one, and it sat a release behind (0.27.7 against a 0.27.8
// bundle) while being the document the MCP registry publishes from, so
// the one channel built for strangers advertised the wrong version of a
// file it also mis-checksummed.
const pkgVersion = JSON.parse(fs.readFileSync(path.join(ROOT_DIR, "package.json"), "utf8")).version;
const manifestVersion = JSON.parse(fs.readFileSync(path.join(ROOT_DIR, "manifest.json"), "utf8")).version;
const serverJsonVersion = JSON.parse(fs.readFileSync(path.join(ROOT_DIR, "server.json"), "utf8")).version;
if (pkgVersion !== manifestVersion || pkgVersion !== serverJsonVersion) {
  process.stderr.write(
    `Version mismatch: package.json=${pkgVersion} manifest.json=${manifestVersion} server.json=${serverJsonVersion}\n` +
    `Update all three files to the same version before building.\n`
  );
  process.exit(1);
}

// Rebuild the skills manifest before packaging so the bundle is never stale.
console.log("Rebuilding skills manifest...");
execSync("node server/build-skill-manifest.js", { cwd: ROOT_DIR, stdio: "inherit" });

// Project the server's tool annotations into manifest.json. The manifest
// is what a Connectors Directory reviewer and the install dialog read, so
// it cannot be allowed to disagree with the running server about which
// tools write to production. Exit 1 means it was stale and has been
// rewritten — fine locally, and the drift test catches the commit.
console.log("Syncing manifest tool annotations...");
try {
  execSync("node scripts/sync-manifest-annotations.mjs", { cwd: ROOT_DIR, stdio: "inherit" });
} catch {
  console.log("manifest.json annotations were stale and have been rewritten — commit the change.");
}

// Keep every stated skill/tool count matching the real inventory. These
// numbers are read by strangers deciding whether to bother, and they were
// understating the product by 41 tools.
console.log("Syncing stated skill/tool counts...");
try {
  execSync("node scripts/sync-counts.mjs", { cwd: ROOT_DIR, stdio: "inherit" });
} catch {
  console.log("Inventory counts were stale and have been rewritten — commit the change.");
}

// Refresh the guide library export from get.yourorbit.team so the
// bundled MCP resources reflect the latest published guides. The
// fetch script is resilient — on failure it preserves whatever
// snapshot is already in data/, so a transient network issue doesn't
// block a build. Set ORBIT_GUIDES_SKIP=1 to force-skip.
console.log("Refreshing guide library export...");
execSync("node scripts/fetch-guides.mjs", { cwd: ROOT_DIR, stdio: "inherit" });

// Refresh the courses export — same pattern, same resilience. Lets
// Claude point users at the right course URL on the website when
// they ask for training on a topic the courses cover.
console.log("Refreshing courses export...");
execSync("node scripts/fetch-courses.mjs", { cwd: ROOT_DIR, stdio: "inherit" });

// Gate the build on the test suite. A failing test is a hard-stop;
// the .mcpb cannot be packaged without every contract and error path
// passing against the real MCP stdio transport. Skip by setting
// ORBIT_SKIP_TESTS=1 — use only when triaging the test harness itself.
if (process.env.ORBIT_SKIP_TESTS === "1") {
  console.log("ORBIT_SKIP_TESTS=1 — skipping test suite (use only for harness debugging).");
} else {
  console.log("Running test suite (set ORBIT_SKIP_TESTS=1 to bypass)...");
  execSync("node tests/run.mjs", { cwd: ROOT_DIR, stdio: "inherit" });
}

// Audit gate — fail the build if any HIGH or CRITICAL advisory is present in
// production dependencies.  devDependencies are excluded because they never
// ship in the .mcpb bundle.  Set ORBIT_SKIP_AUDIT=1 only when triaging the
// audit tooling itself; never skip in a release build.
if (process.env.ORBIT_SKIP_AUDIT === "1") {
  console.log("ORBIT_SKIP_AUDIT=1 — skipping npm audit gate (use only for tooling debugging).");
} else {
  console.log("Running npm audit gate (set ORBIT_SKIP_AUDIT=1 to bypass)...");
  execSync("npm audit --audit-level=high --omit=dev", { cwd: ROOT_DIR, stdio: "inherit" });
}

const COPY_PATHS = [
  "manifest.json",
  "icon.png",
  "icon-light.png",
  "icon-dark.png",
  "assets",
  "orbit.md",
  "orbit-lifecycle-os-claude.md",
  // The telemetry disclosure has to travel with the product. Without this
  // line the only privacy doc in the bundle was docs/IMAGE-GENERATION-PRIVACY.md
  // (Gemini art-layer only), and an installer's entire telemetry disclosure
  // was one user_config description string. A notice that does not ship has
  // not been given. The docs/ entry below carries that renamed file along
  // automatically — it stays a distinct basename from this one, which
  // tests/suites/73-setup-docs.test.mjs guards.
  "PRIVACY.md",
  "data",
  "docs",
  "skills",
  "starter-brand-kit"
];

fs.rmSync(BUILD_DIR, { recursive: true, force: true });
fs.mkdirSync(BUNDLE_SERVER_DIR, { recursive: true });

for (const relativePath of COPY_PATHS) {
  const sourcePath = path.join(ROOT_DIR, relativePath);
  const targetPath = path.join(BUILD_DIR, relativePath);

  if (!fs.existsSync(sourcePath)) {
    continue;
  }

  fs.cpSync(sourcePath, targetPath, {
    recursive: true,
    force: true
  });
}

// Packages that use dynamic require/require.resolve internally and cannot be
// flat-bundled into ESM.  They are copied into node_modules instead.
//
// @modelcontextprotocol/ext-apps is external for a different reason: it is
// not required at import time but READ FROM DISK at runtime.
// server/ui/shell.js inlines the self-contained `app-with-deps` browser
// build into every widget document via import.meta.resolve, which esbuild
// does not follow and therefore does not bundle. Left out of this list the
// package simply isn't in the .mcpb, import.meta.resolve throws
// ERR_MODULE_NOT_FOUND, and every widget silently degrades to
// window.OrbitApp = null on every machine except one with the repo's own
// node_modules above it on disk. The BRIDGE_ENTRY assertion below is what
// keeps that from regressing.
const EXTERNAL_PACKAGES = [
  "@modelcontextprotocol/ext-apps",
  "mjml", "mjml-core", "mjml-migrate", "mjml-parser-xml", "mjml-preset-core",
  "mjml-validator", "mjml-accordion", "mjml-body", "mjml-button", "mjml-carousel",
  "mjml-column", "mjml-divider", "mjml-group", "mjml-head", "mjml-head-attributes",
  "mjml-head-breakpoint", "mjml-head-font", "mjml-head-html-attributes",
  "mjml-head-preview", "mjml-head-style", "mjml-head-title", "mjml-hero",
  "mjml-image", "mjml-navbar", "mjml-raw", "mjml-section", "mjml-social",
  "mjml-spacer", "mjml-table", "mjml-text", "mjml-wrapper",
  "pdfkit", "fontkit", "linebreak", "unicode-properties", "unicode-trie",
  "restructure", "png-js", "brotli", "dfa", "tiny-inflate"
];

await build({
  entryPoints: [path.join(ROOT_DIR, "server", "index.js")],
  outdir: BUNDLE_SERVER_DIR,
  bundle: true,
  format: "esm",
  splitting: true,
  platform: "node",
  target: "node20",
  minify: true,
  sourcemap: false,
  packages: "bundle",
  chunkNames: "chunks/[name]-[hash]",
  external: EXTERNAL_PACKAGES,
  banner: {
    js: 'import{createRequire as __createRequire}from"node:module";const require=__createRequire(import.meta.url);'
  }
});

// Install externalized packages with their full dependency trees via npm.
// This correctly handles nested node_modules and hoisting.
const extPkgJson = {
  name: "orbit-ext-deps",
  private: true,
  dependencies: {}
};
const srcPkg = JSON.parse(fs.readFileSync(path.join(ROOT_DIR, "package.json"), "utf8"));
for (const pkg of EXTERNAL_PACKAGES) {
  if (srcPkg.dependencies[pkg]) {
    extPkgJson.dependencies[pkg] = srcPkg.dependencies[pkg];
  }
}
// Carry the root `overrides` through to the bundle's package.json. The root
// lockfile below is RESOLVED WITH those overrides, and `npm ci` refuses to run
// when package.json and the lockfile disagree — without this it fails with
// "Missing: brace-expansion@2.1.2 from lock file", because the override pins a
// different version than the un-overridden tree would resolve. Overrides live in
// package.json, not the lockfile, so a minimal generated package.json silently
// drops them and desyncs the pair.
if (srcPkg.overrides) {
  extPkgJson.overrides = srcPkg.overrides;
}
fs.writeFileSync(
  path.join(BUILD_DIR, "package.json"),
  JSON.stringify(extPkgJson, null, 2)
);
// Copy the root lockfile so npm ci can resolve exact versions rather than
// floating to the latest matching range.  This makes the bundled renderer
// byte-for-byte reproducible with whatever was tested in CI.
fs.copyFileSync(
  path.join(ROOT_DIR, "package-lock.json"),
  path.join(BUILD_DIR, "package-lock.json")
);
execSync("npm ci --omit=dev --ignore-scripts", {
  cwd: BUILD_DIR,
  stdio: "inherit"
});
// Remove the helper package.json and lockfile — the extension uses manifest.json.
fs.unlinkSync(path.join(BUILD_DIR, "package.json"));
fs.rmSync(path.join(BUILD_DIR, "package-lock.json"), { force: true });

const vendorDir = path.join(BUILD_DIR, "vendor", "resvg");
fs.mkdirSync(vendorDir, { recursive: true });
fs.copyFileSync(
  path.join(ROOT_DIR, "node_modules", "@resvg", "resvg-wasm", "index_bg.wasm"),
  path.join(vendorDir, "index_bg.wasm")
);

// ---------------------------------------------------------------------
// THIRD-PARTY-NOTICES.md — licence-compliance for the shipped bundle.
//
// The .mcpb is a redistribution: it carries the runtime dependency tree,
// so every dependency's licence notice has to travel WITH it, not just
// sit in the repo. `npm ci` above already places 300+ LICENSE files in
// the bundle's node_modules, which quietly satisfies MIT/BSD for
// everyone — EXCEPT @resvg/resvg-wasm, which is MPL-2.0, ships no LICENSE
// of its own, and is the one dependency hand-copied out to vendor/ above.
// MPL-2.0 §3.2 requires recipients be told the licence and where to get
// source. The manifest also declared the whole artefact "MIT", full stop.
//
// This walks the bundle's own node_modules, concatenates every licence it
// finds, and appends the MPL-2.0 notice for resvg by hand (since the
// package omits it). Found by Meridian, 2026-08-21.
// ---------------------------------------------------------------------
function collectLicenseNotices(nodeModulesDir) {
  const out = [];
  if (!fs.existsSync(nodeModulesDir)) return out;
  const entries = fs.readdirSync(nodeModulesDir, { withFileTypes: true });
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    // Scoped packages: recurse one level into @scope/*.
    if (entry.name.startsWith("@")) {
      out.push(...collectLicenseNotices(path.join(nodeModulesDir, entry.name)));
      continue;
    }
    const pkgDir = path.join(nodeModulesDir, entry.name);
    let name = entry.name;
    let license = "UNKNOWN";
    try {
      const pkg = JSON.parse(fs.readFileSync(path.join(pkgDir, "package.json"), "utf8"));
      name = pkg.name || entry.name;
      license = typeof pkg.license === "string" ? pkg.license : (pkg.license?.type || "UNKNOWN");
    } catch { /* no package.json — still list any LICENSE we find */ }
    const licenseFile = fs.readdirSync(pkgDir).find((f) => /^(LICENSE|LICENCE|COPYING|NOTICE)/i.test(f));
    const body = licenseFile
      ? fs.readFileSync(path.join(pkgDir, licenseFile), "utf8").trim()
      : "(no licence file shipped by this package)";
    out.push({ name, license, body });
  }
  return out.sort((a, b) => a.name.localeCompare(b.name));
}

const MPL2_RESVG_NOTICE = [
  "## @resvg/resvg-wasm",
  "",
  "License: MPL-2.0",
  "Source: https://github.com/thx/resvg-js",
  "",
  "This package is licensed under the Mozilla Public License 2.0. The",
  "package does not ship its own LICENSE file; the full MPL-2.0 text is",
  "available at https://www.mozilla.org/en-US/MPL/2.0/ . As required by",
  "MPL-2.0 §3.2, the Source Code for this component is available at the",
  "URL above. Only the compiled WebAssembly (index_bg.wasm) is",
  "redistributed in this bundle.",
].join("\n");

const notices = collectLicenseNotices(path.join(BUILD_DIR, "node_modules"));
const noticesDoc = [
  "# Third-party notices",
  "",
  "Orbit's own code is MIT. This bundle redistributes the dependencies",
  "below, each under its own licence. Generated at pack time from the",
  "shipped node_modules by scripts/build-extension.js.",
  "",
  MPL2_RESVG_NOTICE,
  "",
  "---",
  "",
  ...notices.flatMap((n) => [`## ${n.name}`, "", `License: ${n.license}`, "", "```", n.body, "```", ""]),
].join("\n");
fs.writeFileSync(path.join(BUILD_DIR, "THIRD-PARTY-NOTICES.md"), noticesDoc + "\n");
process.stdout.write(`Wrote THIRD-PARTY-NOTICES.md (${notices.length} packages + MPL-2.0 resvg notice).\n`);

// Sanity check — ensure the bundled entry point was actually written.
const bundledEntry = path.join(BUNDLE_SERVER_DIR, "index.js");
if (!fs.existsSync(bundledEntry)) {
  process.stderr.write(`Build sanity check failed: expected ${bundledEntry} to exist.\n`);
  process.exit(1);
}

// Sanity check — the MCP Apps host bridge must be IN the bundle.
//
// This one is worth an explicit assertion because its failure mode is
// invisible: on a developer's machine Node walks up out of .mcpb-build and
// finds the repo's own node_modules, so widgets look perfectly healthy
// right up until someone else installs the .mcpb.
// Resolved the same way shell.js resolves it — by specifier, from inside
// the bundle — rather than by a hard-coded dist path that the package can
// reshuffle between minor versions.
const BRIDGE_SPECIFIER = "@modelcontextprotocol/ext-apps/app-with-deps";
let bridgeEntry = null;
try {
  bridgeEntry = createRequire(path.join(BUILD_DIR, "noop.js")).resolve(BRIDGE_SPECIFIER);
} catch { /* handled below */ }
if (!bridgeEntry || !fs.existsSync(bridgeEntry)) {
  process.stderr.write(
    `Build sanity check failed: MCP Apps bridge missing from the bundle.\n` +
    `Could not resolve ${BRIDGE_SPECIFIER} from ${BUILD_DIR}.\n` +
    `Without it every widget renders with window.OrbitApp = null on every install.\n`
  );
  process.exit(1);
}

console.log(
  JSON.stringify(
    {
      status: "ok",
      version: pkgVersion,
      build_dir: BUILD_DIR,
      bundled_server_dir: BUNDLE_SERVER_DIR
    },
    null,
    2
  )
);
