import fs from "node:fs";
import path from "node:path";
import { execSync } from "node:child_process";
import { build } from "esbuild";

const ROOT_DIR = process.cwd();
const BUILD_DIR = path.join(ROOT_DIR, ".mcpb-build");
const BUNDLE_SERVER_DIR = path.join(BUILD_DIR, "server");

// Version consistency guard — fail fast if package.json and manifest.json disagree.
const pkgVersion = JSON.parse(fs.readFileSync(path.join(ROOT_DIR, "package.json"), "utf8")).version;
const manifestVersion = JSON.parse(fs.readFileSync(path.join(ROOT_DIR, "manifest.json"), "utf8")).version;
if (pkgVersion !== manifestVersion) {
  process.stderr.write(
    `Version mismatch: package.json=${pkgVersion} manifest.json=${manifestVersion}\n` +
    `Update both files to the same version before building.\n`
  );
  process.exit(1);
}

// Rebuild the skills manifest before packaging so the bundle is never stale.
console.log("Rebuilding skills manifest...");
execSync("node server/build-skill-manifest.js", { cwd: ROOT_DIR, stdio: "inherit" });
const COPY_PATHS = [
  "manifest.json",
  "icon.png",
  "icon-light.png",
  "icon-dark.png",
  "assets",
  "orbit.md",
  "orbit-lifecycle-os-claude.md",
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
const EXTERNAL_PACKAGES = [
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
fs.writeFileSync(
  path.join(BUILD_DIR, "package.json"),
  JSON.stringify(extPkgJson, null, 2)
);
execSync("npm install --production --ignore-scripts", {
  cwd: BUILD_DIR,
  stdio: "inherit"
});
// Remove the helper package.json — the extension uses manifest.json.
fs.unlinkSync(path.join(BUILD_DIR, "package.json"));
fs.rmSync(path.join(BUILD_DIR, "package-lock.json"), { force: true });

const vendorDir = path.join(BUILD_DIR, "vendor", "resvg");
fs.mkdirSync(vendorDir, { recursive: true });
fs.copyFileSync(
  path.join(ROOT_DIR, "node_modules", "@resvg", "resvg-wasm", "index_bg.wasm"),
  path.join(vendorDir, "index_bg.wasm")
);

// Sanity check — ensure the bundled entry point was actually written.
const bundledEntry = path.join(BUNDLE_SERVER_DIR, "index.js");
if (!fs.existsSync(bundledEntry)) {
  process.stderr.write(`Build sanity check failed: expected ${bundledEntry} to exist.\n`);
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
