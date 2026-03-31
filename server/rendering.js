import fs from "node:fs";
import path from "node:path";
import PDFDocument from "pdfkit";
import { Resvg, initWasm } from "@resvg/resvg-wasm";
import { writeText } from "./utils.js";

let wasmReady = false;

export async function renderSvgBundle({
  rootDir,
  svg,
  width,
  height,
  outputBasePath,
  formats = ["svg", "png", "pdf"]
}) {
  const uniqueFormats = [...new Set(formats)];
  const results = {};
  let pngBuffer = null;

  if (uniqueFormats.includes("svg")) {
    results.svg = writeText(`${outputBasePath}.svg`, svg);
  }

  if (uniqueFormats.includes("png") || uniqueFormats.includes("pdf")) {
    await ensureResvg(rootDir);
    const resvg = new Resvg(svg, {
      fitTo: { mode: "width", value: Math.round(width) }
    });
    const rendered = resvg.render();
    pngBuffer = Buffer.from(rendered.asPng());
    if (uniqueFormats.includes("png")) {
      fs.writeFileSync(`${outputBasePath}.png`, pngBuffer);
      results.png = `${outputBasePath}.png`;
    }
    rendered.free();
    resvg.free();
  }

  if (uniqueFormats.includes("pdf")) {
    await writePdfFromPng({
      pngBuffer,
      width,
      height,
      outputPath: `${outputBasePath}.pdf`
    });
    results.pdf = `${outputBasePath}.pdf`;
  }

  return results;
}

async function writePdfFromPng({ pngBuffer, width, height, outputPath }) {
  await new Promise((resolve, reject) => {
    const doc = new PDFDocument({
      size: [Math.round(width), Math.round(height)],
      margin: 0,
      autoFirstPage: true
    });
    const stream = fs.createWriteStream(outputPath);
    doc.pipe(stream);
    doc.image(pngBuffer, 0, 0, {
      width: Math.round(width),
      height: Math.round(height)
    });
    doc.end();
    stream.on("finish", resolve);
    stream.on("error", reject);
  });
}

async function ensureResvg(rootDir) {
  if (wasmReady) {
    return;
  }

  const wasmPath = path.join(
    rootDir,
    "node_modules",
    "@resvg",
    "resvg-wasm",
    "index_bg.wasm"
  );
  const wasmBinary = fs.readFileSync(wasmPath);
  await initWasm(wasmBinary);
  wasmReady = true;
}
