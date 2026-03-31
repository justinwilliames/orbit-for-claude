import { GoogleGenAI } from "@google/genai";
import { escapeXml, sha1 } from "./utils.js";

export async function generateBrandArtLayer({
  config,
  prompt,
  referenceImages = [],
  canvas,
  variationIndex = 0
}) {
  if (config.imageProvider === "mock") {
    return generateMockArtLayer({ prompt, canvas, variationIndex });
  }

  if (!config.googleAiApiKey) {
    const error = new Error("Missing ORBIT_GOOGLE_AI_API_KEY for Nano Banana Pro rendering.");
    error.code = "CONFIGURATION_ERROR";
    throw error;
  }

  const client = new GoogleGenAI({ apiKey: config.googleAiApiKey });
  const parts = [
    { text: `${prompt}\n\nVariation index: ${variationIndex + 1}` },
    ...referenceImages.map((image) => ({
      inlineData: {
        mimeType: image.mimeType,
        data: image.base64
      }
    }))
  ];

  const response = await client.models.generateContent({
    model: config.googleImageModel,
    contents: [{ role: "user", parts }],
    config: {
      responseModalities: ["TEXT", "IMAGE"],
      imageConfig: {
        aspectRatio: canvas.providerAspectRatio ?? canvas.aspectRatio,
        imageSize: canvas.imageSize ?? "2K"
      }
    }
  });

  const firstImagePart = response.candidates?.[0]?.content?.parts?.find(
    (part) => part.inlineData?.data
  );
  if (!firstImagePart?.inlineData?.data) {
    const error = new Error(
      `Nano Banana Pro did not return an image. ${response.text ?? "No text response."}`
    );
    error.code = "PROVIDER_ERROR";
    throw error;
  }

  return {
    provider: "nano-banana-pro",
    model: config.googleImageModel,
    mimeType: firstImagePart.inlineData.mimeType ?? "image/png",
    buffer: Buffer.from(firstImagePart.inlineData.data, "base64"),
    base64: firstImagePart.inlineData.data,
    text: response.text ?? ""
  };
}

function generateMockArtLayer({ prompt, canvas, variationIndex }) {
  const palette = [
    ["#f7d5c8", "#f0efe7", "#d6e7f7"],
    ["#d8ebdf", "#efe3d1", "#f7d2cb"],
    ["#dfe7f8", "#efe5d6", "#f7e8c6"]
  ][variationIndex % 3];
  const noiseSeed = sha1(`${prompt}:${variationIndex}`).slice(0, 8);
  const svg = [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${canvas.width}" height="${canvas.height}" viewBox="0 0 ${canvas.width} ${canvas.height}">`,
    "<defs>",
    `  <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">`,
    `    <stop offset="0%" stop-color="${palette[0]}"/>`,
    `    <stop offset="55%" stop-color="${palette[1]}"/>`,
    `    <stop offset="100%" stop-color="${palette[2]}"/>`,
    "  </linearGradient>",
    `  <filter id="grain"><feTurbulence type="fractalNoise" baseFrequency="0.85" numOctaves="1" seed="${variationIndex + 3}"/><feColorMatrix type="saturate" values="0"/><feComponentTransfer><feFuncA type="table" tableValues="0 0.03"/></feComponentTransfer></filter>`,
    "</defs>",
    `<rect width="${canvas.width}" height="${canvas.height}" fill="url(#bg)"/>`,
    `<rect width="${canvas.width}" height="${canvas.height}" fill="#ffffff" filter="url(#grain)"/>`,
    `<circle cx="${canvas.width * 0.78}" cy="${canvas.height * 0.35}" r="${canvas.height * 0.42}" fill="#ffffff" opacity="0.32"/>`,
    `<circle cx="${canvas.width * 0.18}" cy="${canvas.height * 0.82}" r="${canvas.height * 0.28}" fill="#ffffff" opacity="0.24"/>`,
    `<text x="${canvas.width - 28}" y="${canvas.height - 18}" font-size="12" fill="#6b675f" text-anchor="end">mock art ${escapeXml(noiseSeed)}</text>`,
    "</svg>"
  ].join("");

  return {
    provider: "mock",
    model: "mock",
    mimeType: "image/svg+xml",
    buffer: Buffer.from(svg),
    base64: Buffer.from(svg).toString("base64"),
    text: "Mock image provider output"
  };
}
