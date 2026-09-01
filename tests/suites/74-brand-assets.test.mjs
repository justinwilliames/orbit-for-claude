/**
 * icon.png, icon-light.png and icon-dark.png were byte-identical —
 * `shasum -a1` returned d3beefd77fd508c50c23c00f85e8a081354e57bc for all
 * three (Nova, #14/#23). server/orbit-branding.js's BRANDING_ASSETS wires
 * icon-light.png -> orbit-logo-light.png and icon-dark.png ->
 * orbit-logo-dark.png as though they diverge, and renderOrbitSvgBrandBadge
 * composites whichever one `theme` asks for onto a themed panel (white for
 * light, ORBIT_THEME.bg.dark = #0A0A0B for dark). With the two files
 * identical, a dark-mode brand header was compositing the LIGHT mark —
 * flat #6366F1 indigo square, opaque — into every email a customer sends
 * to their own list, regardless of theme.
 *
 * The fix (assets/generate-icon-dark.py) is a mechanical, transparency-
 * aware recolour of the existing raster: every pixel's blend factor along
 * the old (indigo bg -> white glyph) line is re-projected onto a new
 * (near-black bg -> white glyph) line, with the alpha channel — which
 * carries the rounded-square silhouette — left untouched. No vector
 * master for icon.png's exact glyph exists anywhere in the repo (see that
 * script's docstring for why hand-tracing one was rejected), so this
 * suite does not check for stylistic fidelity to a source SVG. It checks
 * the one thing a re-export regression actually breaks: that the three
 * files are not byte-identical, and that the divergence is a real
 * background recolour rather than noise.
 *
 * Every assertion below is watched-red: each was run against the
 * pre-fix, byte-identical files and failed before the fix landed.
 */

import { test, describe } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createHash } from "node:crypto";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, "..", "..");

const ICON = path.join(ROOT, "icon.png");
const ICON_LIGHT = path.join(ROOT, "icon-light.png");
const ICON_DARK = path.join(ROOT, "icon-dark.png");

function sha1(filePath) {
  return createHash("sha1").update(fs.readFileSync(filePath)).digest("hex");
}

// ---- minimal PNG decode (no new dependency) --------------------------
// Just enough to read an 8-bit RGBA (or RGB) PNG's IHDR and IDAT pixel
// grid, so the suite can assert on actual pixel colour without pulling
// in a new image library for three test assertions.
function readPng(filePath) {
  const zlib = require("node:zlib");
  const buf = fs.readFileSync(filePath);
  if (buf.readUInt32BE(0) !== 0x89504e47) {
    throw new Error(`${filePath} is not a PNG`);
  }

  let offset = 8;
  let width = 0;
  let height = 0;
  let bitDepth = 0;
  let colorType = 0;
  const idatChunks = [];
  let palette = null; // colorType 3: flat [r,g,b, r,g,b, ...]
  let paletteAlpha = null; // colorType 3 + tRNS: per-palette-entry alpha

  while (offset < buf.length) {
    const length = buf.readUInt32BE(offset);
    const type = buf.toString("ascii", offset + 4, offset + 8);
    const dataStart = offset + 8;
    if (type === "IHDR") {
      width = buf.readUInt32BE(dataStart);
      height = buf.readUInt32BE(dataStart + 4);
      bitDepth = buf.readUInt8(dataStart + 8);
      colorType = buf.readUInt8(dataStart + 9);
    } else if (type === "PLTE") {
      palette = buf.subarray(dataStart, dataStart + length);
    } else if (type === "tRNS") {
      paletteAlpha = buf.subarray(dataStart, dataStart + length);
    } else if (type === "IDAT") {
      idatChunks.push(buf.subarray(dataStart, dataStart + length));
    } else if (type === "IEND") {
      break;
    }
    offset = dataStart + length + 4; // + CRC
  }

  assert.equal(bitDepth, 8, `${filePath}: expected 8-bit PNG`);
  // colorType: 2 = RGB, 3 = palette-indexed (1 byte/pixel pre-expansion), 6 = RGBA
  const rawChannels = colorType === 6 ? 4 : colorType === 2 ? 3 : colorType === 3 ? 1 : null;
  assert.ok(rawChannels, `${filePath}: expected RGB, RGBA or palette PNG, got colorType ${colorType}`);
  if (colorType === 3) {
    assert.ok(palette, `${filePath}: palette PNG missing PLTE chunk`);
  }
  const raw = zlib.inflateSync(Buffer.concat(idatChunks));
  const rawStride = width * rawChannels;
  const decoded = Buffer.alloc(height * rawStride);

  // Un-filter (PNG scanline filters 0-4), single pass, no interlacing.
  // Operates on the RAW per-pixel width (1 byte/pixel for palette mode,
  // 3 or 4 for RGB/RGBA) — filtering happens before palette expansion.
  let prevRow = Buffer.alloc(rawStride);
  let rawOffset = 0;
  for (let y = 0; y < height; y++) {
    const filterType = raw[rawOffset];
    rawOffset += 1;
    const row = raw.subarray(rawOffset, rawOffset + rawStride);
    rawOffset += rawStride;
    const outRow = decoded.subarray(y * rawStride, y * rawStride + rawStride);

    for (let x = 0; x < rawStride; x++) {
      const a = x >= rawChannels ? outRow[x - rawChannels] : 0;
      const b = prevRow[x];
      const c = x >= rawChannels ? prevRow[x - rawChannels] : 0;
      let value = row[x];
      if (filterType === 1) value += a;
      else if (filterType === 2) value += b;
      else if (filterType === 3) value += Math.floor((a + b) / 2);
      else if (filterType === 4) {
        const p = a + b - c;
        const pa = Math.abs(p - a);
        const pb = Math.abs(p - b);
        const pc = Math.abs(p - c);
        value += pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
      }
      outRow[x] = value & 0xff;
    }
    prevRow = outRow;
  }

  return {
    width,
    height,
    getPixel(x, y) {
      const i = y * rawStride + x * rawChannels;
      if (colorType === 3) {
        const idx = decoded[i];
        return {
          r: palette[idx * 3],
          g: palette[idx * 3 + 1],
          b: palette[idx * 3 + 2],
          a: paletteAlpha && idx < paletteAlpha.length ? paletteAlpha[idx] : 255
        };
      }
      return {
        r: decoded[i],
        g: decoded[i + 1],
        b: decoded[i + 2],
        a: rawChannels === 4 ? decoded[i + 3] : 255
      };
    }
  };
}

// node:module's require isn't available in an ESM test file by default.
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);

describe("brand icon assets — light and dark actually differ", () => {
  test("icon-light.png and icon-dark.png are not byte-identical", () => {
    const lightHash = sha1(ICON_LIGHT);
    const darkHash = sha1(ICON_DARK);
    assert.notEqual(
      darkHash,
      lightHash,
      "icon-dark.png is a byte-for-byte re-export of icon-light.png — the exact regression this suite exists to catch"
    );
  });

  test("icon.png, icon-light.png and icon-dark.png are not all three identical", () => {
    const hashes = new Set([sha1(ICON), sha1(ICON_LIGHT), sha1(ICON_DARK)]);
    assert.ok(hashes.size > 1, "all three brand icons hash identically — the theme wiring is decorative");
  });

  test("icon-dark.png's fill is genuinely recoloured for a dark ground, not just perturbed", () => {
    const light = readPng(ICON_LIGHT);
    const dark = readPng(ICON_DARK);
    assert.equal(dark.width, light.width, "dark variant must keep the same canvas size");
    assert.equal(dark.height, light.height, "dark variant must keep the same canvas size");

    // (256, 20): solid background fill, well clear of the glyph and the
    // rounded corners, on both known-good source files.
    const lightBg = light.getPixel(256, 20);
    const darkBg = dark.getPixel(256, 20);

    // Light stays the Orbit indigo brand fill.
    assert.ok(
      Math.abs(lightBg.r - 99) < 12 && Math.abs(lightBg.g - 102) < 12 && Math.abs(lightBg.b - 241) < 12,
      `icon-light.png background drifted from Orbit indigo: rgb(${lightBg.r},${lightBg.g},${lightBg.b})`
    );

    // Dark must be a real dark ground (low luminance), not the same
    // indigo, and not simply inverted to something equally bright.
    const darkLuminance = 0.2126 * darkBg.r + 0.7152 * darkBg.g + 0.0722 * darkBg.b;
    assert.ok(
      darkLuminance < 60,
      `icon-dark.png background is not dark enough for a dark-ground mark: rgb(${darkBg.r},${darkBg.g},${darkBg.b}), luminance ${darkLuminance.toFixed(1)}`
    );
    assert.ok(
      Math.abs(darkBg.r - lightBg.r) + Math.abs(darkBg.g - lightBg.g) + Math.abs(darkBg.b - lightBg.b) > 200,
      "icon-dark.png background is barely different from icon-light.png's — not a real recolour"
    );
  });

  test("both variants keep the same silhouette — a recolour, not a redraw", () => {
    const light = readPng(ICON_LIGHT);
    const dark = readPng(ICON_DARK);

    // (5, 5): fully transparent in the known-good source, outside the
    // rounded-square corner curve.
    const lightCorner = light.getPixel(5, 5);
    const darkCorner = dark.getPixel(5, 5);
    assert.equal(lightCorner.a, 0, "sanity: (5,5) must be transparent in icon-light.png");
    assert.equal(darkCorner.a, 0, "icon-dark.png's outline moved — (5,5) should still be outside the mark");

    // (256, 256): the glyph itself, which the recolour is defined to
    // leave white in both variants.
    const lightGlyph = light.getPixel(256, 256);
    const darkGlyph = dark.getPixel(256, 256);
    for (const [label, px] of [["icon-light.png", lightGlyph], ["icon-dark.png", darkGlyph]]) {
      assert.ok(
        px.r > 240 && px.g > 240 && px.b > 240,
        `${label} glyph pixel at (256,256) is not white: rgb(${px.r},${px.g},${px.b})`
      );
    }
  });
});
