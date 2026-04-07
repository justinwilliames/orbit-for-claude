import fs from "node:fs";
import path from "node:path";
import { writeText } from "./utils.js";

// Promise singleton — prevents double-init when concurrent calls both reach ensureResvg
// before the first initWasm resolves.
let wasmInitPromise = null;

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
    const { Resvg } = await import("@resvg/resvg-wasm");
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
    const pdfSvg = await prepareSvgForPdf({ rootDir, svg });
    await writePdfFromSvg({
      svg: pdfSvg,
      width,
      height,
      outputPath: `${outputBasePath}.pdf`
    });
    results.pdf = `${outputBasePath}.pdf`;
  }

  return results;
}

async function writePdfFromSvg({ svg, width, height, outputPath }) {
  const [{ default: PDFDocument }, { default: SVGtoPDF }] = await Promise.all([
    import("pdfkit"),
    import("svg-to-pdfkit")
  ]);

  await new Promise((resolve, reject) => {
    const doc = new PDFDocument({
      size: [Math.round(width), Math.round(height)],
      margin: 0,
      autoFirstPage: true
    });
    const stream = fs.createWriteStream(outputPath);
    doc.pipe(stream);
    SVGtoPDF(doc, svg, 0, 0, {
      width: Math.round(width),
      height: Math.round(height),
      preserveAspectRatio: "xMidYMid meet"
    });
    doc.end();
    stream.on("finish", resolve);
    stream.on("error", reject);
  });
}

async function ensureResvg(rootDir) {
  if (!wasmInitPromise) {
    wasmInitPromise = (async () => {
      const wasmPath =
        findFirstExistingPath([
          path.join(rootDir, "vendor", "resvg", "index_bg.wasm"),
          path.join(rootDir, "node_modules", "@resvg", "resvg-wasm", "index_bg.wasm")
        ]) ??
        path.join(rootDir, "vendor", "resvg", "index_bg.wasm");
      const wasmBinary = fs.readFileSync(wasmPath);
      const { initWasm } = await import("@resvg/resvg-wasm");
      await initWasm(wasmBinary);
    })();
  }
  await wasmInitPromise;
}

function findFirstExistingPath(candidates) {
  return candidates.find((candidate) => fs.existsSync(candidate)) ?? null;
}

async function prepareSvgForPdf({ rootDir, svg }) {
  const embeddedSvgUris = [...svg.matchAll(/data:image\/svg\+xml(?:;charset=[^;,]+)?(?:;base64)?,[^")'\s]+/g)];
  if (embeddedSvgUris.length === 0) {
    return svg;
  }

  await ensureResvg(rootDir);
  const { Resvg } = await import("@resvg/resvg-wasm");
  const replacements = new Map();

  for (const match of embeddedSvgUris) {
    const dataUri = match[0];
    if (replacements.has(dataUri)) {
      continue;
    }

    const embeddedSvg = decodeSvgDataUri(dataUri);
    const resvg = new Resvg(embeddedSvg);
    const rendered = resvg.render();
    const pngBase64 = Buffer.from(rendered.asPng()).toString("base64");
    replacements.set(dataUri, `data:image/png;base64,${pngBase64}`);
    rendered.free();
    resvg.free();
  }

  let preparedSvg = svg;
  for (const [from, to] of replacements.entries()) {
    preparedSvg = preparedSvg.split(from).join(to);
  }

  return preparedSvg;
}

function decodeSvgDataUri(dataUri) {
  const [, metadata = "", payload = ""] =
    dataUri.match(/^data:image\/svg\+xml([^,]*),(.*)$/) ?? [];
  if (!payload) {
    return "";
  }

  if (metadata.includes(";base64")) {
    return Buffer.from(payload, "base64").toString("utf8");
  }

  return decodeURIComponent(payload);
}
